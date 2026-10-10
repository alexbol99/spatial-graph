import type { Point2D, Segment2D, Vector2D } from '../types.js';

export const vector = (from: Point2D, to: Point2D): Vector2D => [to[0] - from[0], to[1] - from[1]];
export const distance = (a: Point2D, b: Point2D): number => Math.hypot(...vector(a, b));
export const midpoint = ([a, b]: Segment2D): Point2D => [a[0] / 2 + b[0] / 2, a[1] / 2 + b[1] / 2];
export const dot = (a: Vector2D, b: Vector2D): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vector2D, b: Vector2D): number => a[0] * b[1] - a[1] * b[0];
export const unit = (v: Vector2D): Vector2D => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length];
};
/** Unsigned angle in [0,180]; normalization avoids overflowing cross/dot products. */
export function angleDegrees(a: Vector2D, b: Vector2D): number {
  const u = unit(a), v = unit(b);
  return Math.atan2(Math.abs(cross(u, v)), dot(u, v)) * 180 / Math.PI;
}
export const pointOf = (record: { x: number; y: number }): Point2D => [record.x, record.y];
export function validateAngle(tolerance: number): void {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance >= 90) throw new RangeError('Angle tolerance must be finite and in [0, 90).');
}
export function validateTolerance(tolerance: number): void {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError('Position tolerance must be finite and nonnegative.');
}
export function validateSegment(segment: Segment2D): void {
  if (!Number.isFinite(distance(...segment))) throw new RangeError('Edge length must be finite; use endpoints with a representable separation.');
}
export function pairKey(a: string, b: string): string { return JSON.stringify(a < b ? [a, b] : [b, a]); }
/** Stable lexical ordering, independent of the runtime's locale. */
export const compareKeys = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const freezePoint = (point: Point2D): Point2D => Object.freeze([point[0], point[1]] as const);
export function copyData<T extends object>(data: T): T {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Attributes must be an object dictionary.');
  return { ...data };
}
