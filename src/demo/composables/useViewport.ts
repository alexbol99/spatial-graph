import { computed, ref, shallowRef } from 'vue';
import type { NxPoint } from '@flatten-js/spatial-graph';

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Pan and zoom for an SVG surface. The world is drawn inside one `<g>` with
 * `translate(tx ty) scale(s)`; `s` is screen px per world unit.
 */
export function useViewport() {
  const svg = shallowRef<SVGSVGElement | null>(null);
  const tx = ref(0);
  const ty = ref(0);
  const scale = ref(1);

  const transform = computed(() => `translate(${tx.value} ${ty.value}) scale(${scale.value})`);

  function origin(): { left: number; top: number; width: number; height: number } {
    const rect = svg.value?.getBoundingClientRect();
    return rect ?? { left: 0, top: 0, width: 0, height: 0 };
  }

  /** Client (page) coordinates to world coordinates. */
  function toWorld(clientX: number, clientY: number): NxPoint {
    const { left, top } = origin();
    return [(clientX - left - tx.value) / scale.value, (clientY - top - ty.value) / scale.value];
  }

  /** World coordinates to pixels inside the surface. */
  function toScreen(world: NxPoint): NxPoint {
    return [world[0] * scale.value + tx.value, world[1] * scale.value + ty.value];
  }

  /** Zoom by `factor`, keeping the world point under (clientX, clientY) fixed. */
  function zoomAt(clientX: number, clientY: number, factor: number): void {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor));
    const { left, top } = origin();
    const x = clientX - left;
    const y = clientY - top;
    const wx = (x - tx.value) / scale.value;
    const wy = (y - ty.value) / scale.value;
    scale.value = next;
    tx.value = x - wx * next;
    ty.value = y - wy * next;
  }

  function setTranslation(x: number, y: number): void {
    tx.value = x;
    ty.value = y;
  }

  /** Fit `bounds` in the surface with `margin` px around it. */
  function fit(bounds: Bounds | null, margin = 48): void {
    const { width, height } = origin();
    if (!bounds || width === 0 || height === 0) return;
    const w = Math.max(bounds.maxX - bounds.minX, 1);
    const h = Math.max(bounds.maxY - bounds.minY, 1);
    const next = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((width - 2 * margin) / w, (height - 2 * margin) / h)),
    );
    scale.value = next;
    tx.value = (width - w * next) / 2 - bounds.minX * next;
    ty.value = (height - h * next) / 2 - bounds.minY * next;
  }

  return { svg, tx, ty, scale, transform, toWorld, toScreen, zoomAt, setTranslation, fit };
}
