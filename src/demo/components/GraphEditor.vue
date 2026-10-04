<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { EditorController, PointerInput, View } from '../editor/controller.js';
import { buildRenderModel, graphBounds } from '../editor/render-model.js';
import { useViewport } from '../composables/useViewport.js';
import GraphLayers from './GraphLayers.vue';
import OverlayLayers from './OverlayLayers.vue';

// Turns DOM events into world-space input for the controller and draws what it
// reports. It holds no editing rules; panning and zooming live here because they
// are about the screen, not the graph.
const props = defineProps<{ controller: EditorController }>();

const viewport = useViewport();
const { svg, scale } = viewport;

const view = shallowRef<View>(props.controller.view);
const rev = computed(() => view.value.graphRev);
const model = computed(() => {
  void rev.value;
  return buildRenderModel(props.controller.graph);
});

const spaceHeld = ref(false);
const panning = ref(false);
const cursor = computed(() => {
  if (panning.value) return 'grabbing';
  if (spaceHeld.value) return 'grab';
  return view.value.cursor;
});

let unsubscribe: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;
let fitted = false;

function fit(): void {
  viewport.fit(graphBounds(props.controller.graph));
}

function input(event: PointerEvent | MouseEvent, extra: Partial<PointerInput> = {}): PointerInput {
  return {
    world: viewport.toWorld(event.clientX, event.clientY),
    mod: event.ctrlKey || event.metaKey,
    space: spaceHeld.value,
    ...extra,
  };
}

// ─── Pointer ────────────────────────────────────────────────────────────────

type Pan = { x: number; y: number; tx: number; ty: number; moved: boolean; clearOnClick: boolean };
let pan: Pan | null = null;
const PAN_THRESHOLD = 4;

function onPointerDown(event: PointerEvent): void {
  // The right button belongs to the context-menu handler.
  if (event.button === 2) return;
  svg.value?.setPointerCapture(event.pointerId);

  const result = props.controller.pointerDown(input(event, { button: event.button }));
  if (result === 'claimed') return;

  pan = {
    x: event.clientX,
    y: event.clientY,
    tx: viewport.tx.value,
    ty: viewport.ty.value,
    moved: false,
    clearOnClick: result === 'empty',
  };
}

function onPointerMove(event: PointerEvent): void {
  if (pan) {
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) >= PAN_THRESHOLD) {
      pan.moved = true;
      panning.value = true;
    }
    if (pan.moved) viewport.setTranslation(pan.tx + dx, pan.ty + dy);
    return;
  }
  props.controller.pointerMove(input(event));
}

function onPointerUp(event: PointerEvent): void {
  if (svg.value?.hasPointerCapture(event.pointerId)) svg.value.releasePointerCapture(event.pointerId);
  if (pan) {
    if (!pan.moved && pan.clearOnClick) props.controller.clickEmpty();
    pan = null;
    panning.value = false;
    return;
  }
  props.controller.pointerUp(input(event));
}

function onPointerCancel(): void {
  pan = null;
  panning.value = false;
  props.controller.pointerCancel();
}

function onDoubleClick(event: MouseEvent): void {
  props.controller.doubleClick(input(event));
}

function onContextMenu(event: MouseEvent): void {
  event.preventDefault();
  // On macOS a Ctrl+click also raises the context menu; that is the draw modifier, not a delete.
  props.controller.contextMenu({ world: viewport.toWorld(event.clientX, event.clientY), mod: event.ctrlKey });
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  viewport.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)));
}

// ─── Keyboard ───────────────────────────────────────────────────────────────

function typingInField(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function onKeyDown(event: KeyboardEvent): void {
  if (typingInField(event)) return;
  if (event.code === 'Space') {
    spaceHeld.value = true;
    event.preventDefault();
    return;
  }
  const handled = props.controller.keyDown({
    key: event.key,
    mod: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
  });
  if (handled) event.preventDefault();
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') spaceHeld.value = false;
}

function onBlur(): void {
  spaceHeld.value = false;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

watch(scale, (value) => props.controller.setScale(value), { immediate: true });

onMounted(() => {
  unsubscribe = props.controller.subscribe((next) => {
    view.value = next;
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // Fit once the surface has a size; later resizes keep the current view.
  resizeObserver = new ResizeObserver(() => {
    if (fitted) return;
    const rect = svg.value?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      fitted = true;
      fit();
    }
  });
  if (svg.value) resizeObserver.observe(svg.value);
});

onBeforeUnmount(() => {
  unsubscribe?.();
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
});

defineExpose({ fit });
</script>

<template>
  <svg
    ref="svg"
    class="surface"
    :style="{ cursor }"
    role="application"
    aria-label="Graph editor canvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerleave="controller.pointerLeave()"
    @dblclick="onDoubleClick"
    @contextmenu="onContextMenu"
    @wheel="onWheel"
  >
    <defs>
      <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M100 0H0V100" fill="none" class="grid-line" vector-effect="non-scaling-stroke" />
      </pattern>
    </defs>
    <g :transform="viewport.transform.value">
      <rect
        x="-20000"
        y="-20000"
        width="40000"
        height="40000"
        fill="url(#grid)"
        :opacity="scale < 0.2 ? 0 : 1"
        class="grid"
      />
      <GraphLayers :model="model" :scale="scale" />
      <OverlayLayers :graph="controller.graph" :view="view" :scale="scale" />
    </g>
  </svg>
</template>

<style scoped>
.surface {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--surface);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}
.grid {
  pointer-events: none;
}
.grid-line {
  stroke: var(--grid);
  stroke-width: 1;
}
</style>
