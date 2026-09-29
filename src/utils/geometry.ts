import { Point, Segment, Vector } from '@flatten-js/core';
import type { NxPoint, NxEdge } from '../types.js';
import { COORDINATE_PRECISION } from '../constants.js';

/**
 * Round a point's coordinates to the specified precision
 */
export function roundPoint(point: NxPoint): NxPoint {
  const factor = Math.pow(10, COORDINATE_PRECISION);
  return [Math.round(point[0] * factor) / factor, Math.round(point[1] * factor) / factor];
}

/**
 * Convert NxPoint to flatten-js Point
 */
export function toFlattenPoint(point: NxPoint): Point {
  return new Point(point[0], point[1]);
}

/**
 * Convert flatten-js Point to NxPoint, snapped to the graph's coordinate grid
 * (`COORDINATE_PRECISION`)
 */
export function fromFlattenPoint(point: Point): NxPoint {
  return roundPoint([point.x, point.y]);
}

/**
 * Convert NxEdge to flatten-js Segment
 */
export function toFlattenSegment(edge: NxEdge): Segment {
  return new Segment(toFlattenPoint(edge[0]), toFlattenPoint(edge[1]));
}

/**
 * Convert flatten-js Segment to NxEdge
 */
export function fromFlattenSegment(segment: Segment): NxEdge {
  return [fromFlattenPoint(segment.start), fromFlattenPoint(segment.end)];
}

/**
 * Get the Euclidean distance between two points
 */
export function getPointDistance(start: NxPoint, end: NxPoint): number {
  return toFlattenPoint(start).distanceTo(toFlattenPoint(end))[0];
}

/**
 * Calculate the angle between two segments using cross product
 * Returns angle in degrees
 */
export function getLinesAngleByCross(seg1: Segment, seg2: Segment): number {
  const v1 = new Vector(seg1.start, seg1.end);
  const v2 = new Vector(seg2.start, seg2.end);

  const cross = v1.cross(v2);
  const dot = v1.dot(v2);

  let angle = Math.atan2(Math.abs(cross), dot) * (180 / Math.PI);

  // Normalize to 0-180 range
  if (angle > 180) {
    angle = 360 - angle;
  }

  return angle;
}

/**
 * Calculate the dot product of two segments
 */
export function getLinesDot(seg1: Segment, seg2: Segment): number {
  const v1 = new Vector(seg1.start, seg1.end);
  const v2 = new Vector(seg2.start, seg2.end);

  return v1.dot(v2);
}

/**
 * Check if a segment has valid (non-zero) length
 */
export function hasValidLength(segment: Segment): boolean {
  return segment.length > 0;
}

/**
 * Compare two points for equality
 */
export function pointsEqual(p1: NxPoint, p2: NxPoint): boolean {
  const r1 = roundPoint(p1);
  const r2 = roundPoint(p2);
  return r1[0] === r2[0] && r1[1] === r2[1];
}

/**
 * Compare two edges for equality (order-independent)
 */
export function edgesEqual(e1: NxEdge, e2: NxEdge): boolean {
  return (
    (pointsEqual(e1[0], e2[0]) && pointsEqual(e1[1], e2[1])) ||
    (pointsEqual(e1[0], e2[1]) && pointsEqual(e1[1], e2[0]))
  );
}

/**
 * Simplify a polyline with the Ramer-Douglas-Peucker algorithm.
 */
export function simplifyPolylinePath(path: NxPoint[], epsilon: number): NxPoint[] {
  if (path.length <= 2) return path;

  let maxDistance = -Infinity;
  let splitIndex = -1;
  const start = path[0];
  const end = path[path.length - 1];
  if (!start || !end) return path;

  const baseline = new Segment(toFlattenPoint(start), toFlattenPoint(end));

  for (let index = 1; index < path.length - 1; index += 1) {
    const point = path[index];
    if (!point) continue;

    const distanceToBaseline = baseline.distanceTo(toFlattenPoint(point))[0];
    if (distanceToBaseline > maxDistance) {
      maxDistance = distanceToBaseline;
      splitIndex = index;
    }
  }

  if (maxDistance <= epsilon || splitIndex < 0) {
    return [start, end];
  }

  const first = simplifyPolylinePath(path.slice(0, splitIndex + 1), epsilon);
  const second = simplifyPolylinePath(path.slice(splitIndex), epsilon);
  return [...first.slice(0, -1), ...second];
}
