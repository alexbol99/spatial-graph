import { Line } from '@flatten-js/core';
import type { Segment } from '@flatten-js/core';
import type { NxEdge, NxPoint } from '../types.js';
import { toFlattenPoint, fromFlattenPoint } from './geometry.js';

/**
 * Project a point onto a segment (not the infinite line)
 * Returns the closest point on the segment, which may be an endpoint
 */
export function projectPointOnSegment(point: NxPoint, segment: Segment): NxPoint {
  const p = toFlattenPoint(point);

  // A zero-length segment defines no line (flatten-js throws for it); its
  // closest point is its endpoint
  if (segment.start.equalTo(segment.end)) {
    return fromFlattenPoint(segment.start);
  }

  // Get the projection on the infinite line
  const line = new Line(segment.start, segment.end);
  const projected = p.projectionOn(line);

  // Check if the projection is on the segment
  const distToStart = segment.start.distanceTo(projected)[0];
  const distToEnd = segment.end.distanceTo(projected)[0];
  const segmentLength = segment.length;

  // If projection is beyond the segment, return the closest endpoint
  if (distToStart > segmentLength) {
    return fromFlattenPoint(segment.end);
  } else if (distToEnd > segmentLength) {
    return fromFlattenPoint(segment.start);
  }

  return fromFlattenPoint(projected);
}

/**
 * Project an edge onto a line.
 * Projects both endpoints of the edge onto the line.
 */
export function projectEdgeToLine(edge: NxEdge, line: Segment): NxEdge {
  const lineObj = new Line(line.start, line.end);

  const start = toFlattenPoint(edge[0]);
  const end = toFlattenPoint(edge[1]);

  const projectedStart = start.projectionOn(lineObj);
  const projectedEnd = end.projectionOn(lineObj);

  return [fromFlattenPoint(projectedStart), fromFlattenPoint(projectedEnd)];
}
