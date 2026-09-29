import { Point, type Segment } from '@flatten-js/core';
import type { NxPoint, NxEdge } from '../types.js';
import { toFlattenSegment, fromFlattenPoint, toFlattenPoint, pointsEqual } from './geometry.js';

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

  const point = fromFlattenPoint(intersection);

  if (checkPointOnEdge) {
    if (!isPointOnSegment(point, seg1) || !isPointOnSegment(point, seg2)) {
      return null;
    }
  }

  return point;
}

/**
 * Check if a point lies on a segment
 * @param point Point to check
 * @param segment Segment to check against
 * @returns true if point is on segment (within floating point tolerance)
 */
export function isPointOnSegment(point: NxPoint, segment: Segment): boolean {
  const p = toFlattenPoint(point);

  // Check if point is an endpoint
  if (
    pointsEqual(point, fromFlattenPoint(segment.start)) ||
    pointsEqual(point, fromFlattenPoint(segment.end))
  ) {
    return true;
  }

  // Check if point is on the segment using distance
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
