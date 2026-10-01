<script setup lang="ts">
import { computed } from 'vue';
import type { NxEdge, NxPoint, SpatialGraph } from '@flatten-js/spatial-graph';
import type { View } from '../editor/controller.js';
import { vertexRadius } from '../editor/hit.js';
import { perp, sub, unit, widthOf } from '../editor/util.js';

// Hover and selection ink, the insertion ghost, snap ring and draw preview.
// Everything is annotation, so every length is screen px divided by the zoom.
const props = defineProps<{ graph: SpatialGraph; view: View; scale: number }>();

type Line = { key: string; a: NxPoint; b: NxPoint };

/** The two long faces of an edge's body, as lines. */
function faces(edges: readonly NxEdge[]): Line[] {
  return edges.flatMap((edge, i) => {
    const [a, b] = edge;
    const n = perp(unit(sub(b, a)));
    const half = widthOf(props.graph, edge) / 2;
    const off = (p: NxPoint, k: number): NxPoint => [p[0] + n[0] * half * k, p[1] + n[1] * half * k];
    return [
      { key: `${i}+`, a: off(a, 1), b: off(b, 1) },
      { key: `${i}-`, a: off(a, -1), b: off(b, -1) },
    ];
  });
}

const selectedEdges = computed<NxEdge[]>(() =>
  props.view.selection.kind === 'body' ? props.view.selection.edges : [],
);
const hoverFaces = computed(() => faces(props.view.hoverEdges));
const selectedFaces = computed(() => faces(selectedEdges.value));
const edgeScope = computed(
  () => props.view.selection.kind === 'body' && props.view.selection.scope === 'edge',
);

const selectedVertex = computed(() =>
  props.view.selection.kind === 'vertex' ? props.view.selection.at : null,
);
const hoveredVertex = computed(() => {
  const hover = props.view.hover;
  if (hover.kind !== 'vertex') return null;
  const selected = selectedVertex.value;
  return selected && selected[0] === hover.at[0] && selected[1] === hover.at[1] ? null : hover.at;
});

const ringRadius = (at: NxPoint) => vertexRadius(props.graph, at, props.scale);

const preview = computed(() => {
  const plan = props.view.preview;
  if (!plan || plan.points.length < 2) return null;
  return {
    points: plan.points.map((p) => p.join(',')).join(' '),
    width: plan.width,
    valid: plan.valid,
    crossings: plan.points.slice(1, -1),
    start: plan.points[0]!,
  };
});
</script>

<template>
  <g class="overlay">
    <!-- draw preview -->
    <g v-if="preview" :opacity="preview.valid ? 1 : 0.45">
      <polyline
        :points="preview.points"
        :stroke-width="preview.width"
        stroke-linecap="square"
        stroke-linejoin="round"
        fill="none"
        class="preview-body"
      />
      <polyline
        :points="preview.points"
        :stroke-width="1.5 / scale"
        :stroke-dasharray="`${7 / scale} ${5 / scale}`"
        fill="none"
        class="preview-centre"
      />
      <circle :cx="preview.start[0]" :cy="preview.start[1]" :r="4 / scale" class="preview-dot" />
      <rect
        v-for="(p, i) in preview.crossings"
        :key="i"
        :x="p[0] - 4 / scale"
        :y="p[1] - 4 / scale"
        :width="8 / scale"
        :height="8 / scale"
        :transform="`rotate(45 ${p[0]} ${p[1]})`"
        class="preview-dot"
      />
    </g>

    <!-- hover: both faces, thin, blue -->
    <g class="hover-faces" :stroke-width="1.5 / scale">
      <line v-for="l in hoverFaces" :key="`h${l.key}`" :x1="l.a[0]" :y1="l.a[1]" :x2="l.b[0]" :y2="l.b[1]" />
    </g>

    <!-- selection: the same faces, amber; an edge also gets a solid centreline -->
    <g class="select-faces" :stroke-width="2 / scale">
      <line v-for="l in selectedFaces" :key="`s${l.key}`" :x1="l.a[0]" :y1="l.a[1]" :x2="l.b[0]" :y2="l.b[1]" />
    </g>
    <g v-if="edgeScope" class="select-faces" :stroke-width="4 / scale" stroke-linecap="round">
      <line v-for="(edge, i) in selectedEdges" :key="`e${i}`" :x1="edge[0][0]" :y1="edge[0][1]" :x2="edge[1][0]" :y2="edge[1][1]" />
    </g>

    <!-- vertex rings -->
    <circle
      v-if="hoveredVertex"
      :cx="hoveredVertex[0]"
      :cy="hoveredVertex[1]"
      :r="ringRadius(hoveredVertex)"
      :stroke-width="2 / scale"
      class="ring-hover"
    />
    <circle
      v-if="selectedVertex"
      :cx="selectedVertex[0]"
      :cy="selectedVertex[1]"
      :r="ringRadius(selectedVertex)"
      :stroke-width="2.5 / scale"
      class="ring-select"
    />

    <!-- insertion ghost -->
    <g v-if="view.ghost" :transform="`translate(${view.ghost.at[0]} ${view.ghost.at[1]})`">
      <circle :r="7 / scale" class="ghost" />
      <path
        :d="`M${-3.5 / scale} 0H${3.5 / scale}M0 ${-3.5 / scale}V${3.5 / scale}`"
        :stroke-width="1.8 / scale"
        stroke-linecap="round"
        class="ghost-plus"
      />
    </g>

    <!-- snap: green when it lands on something, red when a vertex will collapse -->
    <circle
      v-if="view.ring"
      :cx="view.ring.at[0]"
      :cy="view.ring.at[1]"
      :r="11 / scale"
      :stroke-width="2.5 / scale"
      :class="view.ring.kind === 'collapse' ? 'ring-collapse' : 'ring-snap'"
    />
  </g>
</template>

<style scoped>
.overlay {
  pointer-events: none;
}
.preview-body {
  stroke: var(--snap);
  opacity: 0.28;
}
.preview-centre {
  stroke: var(--snap);
}
.preview-dot {
  fill: var(--snap);
}
.hover-faces line {
  stroke: var(--hover);
}
.select-faces line {
  stroke: var(--select);
}
.ring-hover {
  fill: none;
  stroke: var(--hover);
}
.ring-select {
  fill: none;
  stroke: var(--select);
}
.ring-snap {
  fill: none;
  stroke: var(--snap);
}
.ring-collapse {
  fill: none;
  stroke: var(--collapse);
}
.ghost {
  fill: var(--hover);
}
.ghost-plus {
  stroke: #fff;
}
</style>
