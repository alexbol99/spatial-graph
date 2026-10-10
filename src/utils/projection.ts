import type { Point2D, Segment2D } from '../types.js';
import { distance, dot, unit, vector } from './geometry.js';

/** Exact closest point on a segment; t follows the supplied endpoint orientation. */
export function projectPoint(point: Point2D, [a, b]: Segment2D) {
  const length = distance(a, b);
  if (length === 0) {
    return { point: a, distance: distance(point, a), t: 0, clamped: false };
  }
  const along = dot(vector(a, point), unit(vector(a, b)));
  if (Number.isNaN(along)) {
    throw new RangeError(
      'Projection cannot be represented; use coordinates with a smaller separation.',
    );
  }
  // Clamp before division so distant queries on tiny segments cannot overflow t.
  const t = along <= 0 ? 0 : along >= length ? 1 : along / length;
  const projected: Point2D = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
  return {
    point: projected,
    distance: distance(point, projected),
    t,
    clamped: along < 0 || along > length,
  };
}
