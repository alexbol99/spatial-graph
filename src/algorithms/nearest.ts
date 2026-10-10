import type { Point2D, Segment2D } from '../types.js';
import { distance } from '../utils/geometry.js';
import { projectPoint } from '../utils/projection.js';

/** Exact scan reference, preserving iteration order for equal-distance ties. */
export function nearestKey(
  keys: Iterable<string>,
  evaluate: (key: string) => number,
): string | null {
  let winner: string | null = null;
  let best = Infinity;
  for (const key of keys) {
    const value = evaluate(key);
    if (winner === null || value < best) {
      winner = key;
      best = value;
    }
  }
  return winner;
}

export const nodeDistance = (point: Point2D, candidate: Point2D): number =>
  distance(point, candidate);

export const edgeDistance = (point: Point2D, candidate: Segment2D): number =>
  projectPoint(point, candidate).distance;
