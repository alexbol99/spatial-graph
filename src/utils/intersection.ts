import { Line, Point, type Segment } from '@flatten-js/core';
import type { NxPoint, NxEdge } from '../types.js';
import { toFlattenSegment, fromFlattenPoint, toFlattenPoint } from './geometry.js';

/**
 * Find the intersection point of two edges
 * @param e1 First edge
 * @param e2 Second edge
 * @param checkPointOnEdge If true, verify the intersection point is on both edges
 * @returns Intersection point or null if no intersection exists
 */
export function findIntersection(e1: NxEdge, e2: NxEdge, checkPointOnEdge = true): NxPoint | null {
  const seg1 = toFlattenSegment(e1);
  const seg2 = toFlattenSegment(e2);

  const intersections = seg1.intersect(seg2);

  if (intersections.length === 0) {
    return null;
  }

  if (intersections.length !== 1) {
    return null;
  }

  const intersection = intersections[0] instanceof Point ? intersections[0] : null;
  if (!intersection) {
    return null;
  }

  // Validate the exact intersection; only the returned point is snapped to the
  // coordinate grid. Validating the rounded point would reject crossings that
  // do not fall on the grid, e.g. at [0.5, 0.5].
  if (checkPointOnEdge) {
    const exact: NxPoint = [intersection.x, intersection.y];
    if (!isPointOnSegment(exact, seg1) || !isPointOnSegment(exact, seg2)) {
      return null;
    }
  }

  return fromFlattenPoint(intersection);
}

/**
 * Find the intersection point of the infinite lines through two edges
 * @param e1 First edge
 * @param e2 Second edge
 * @param checkPointOnEdge If true, the point must also lie on both edges
 * @returns Exact (not grid-snapped) intersection point, or null for parallel,
 *   coincident or zero-length edges
 */
export function findLineIntersection(
  e1: NxEdge,
  e2: NxEdge,
  checkPointOnEdge = false,
): NxPoint | null {
  const seg1 = toFlattenSegment(e1);
  const seg2 = toFlattenSegment(e2);

  // A zero-length edge defines no line (flatten-js Line throws for it)
  if (seg1.start.equalTo(seg1.end) || seg2.start.equalTo(seg2.end)) {
    return null;
  }

  const [point] = new Line(seg1.start, seg1.end).intersect(new Line(seg2.start, seg2.end));
  if (!point) {
    return null;
  }

  if (checkPointOnEdge && !(seg1.contains(point) && seg2.contains(point))) {
    return null;
  }

  return [point.x, point.y];
}

/**
 * Check if a point lies on a segment
 * @param point Point to check
 * @param segment Segment to check against
 * @returns true if point is on segment (within floating point tolerance)
 */
export function isPointOnSegment(point: NxPoint, segment: Segment): boolean {
  const p = toFlattenPoint(point);

  // Check if point is on the segment using distance (covers endpoints too)
  const distToSegment = segment.distanceTo(p)[0];

  // Use a small epsilon for floating point comparison
  const epsilon = 1e-10;

  if (distToSegment > epsilon) {
    return false;
  }

  // Also verify the point is between the endpoints
  const distToStart = segment.start.distanceTo(p)[0];
  const distToEnd = segment.end.distanceTo(p)[0];
  const segmentLength = segment.length;

  // Point is on segment if sum of distances equals segment length (within epsilon)
  return Math.abs(distToStart + distToEnd - segmentLength) < epsilon;
}
