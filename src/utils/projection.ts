import { Point, Line } from '@flatten-js/core';
import type { Segment, NxPoint, NxEdge } from '../types.js';
import { toFlattenPoint, fromFlattenPoint } from './geometry.js';

/**
 * Project a point onto a line defined by two points
 * Returns the closest point on the infinite line
 */
export function projectPointToLine(
  point: Point | NxPoint,
  lineStart: NxPoint,
  lineEnd: NxPoint,
): Point {
  const p = point instanceof Point ? point : toFlattenPoint(point);
  const start = toFlattenPoint(lineStart);
  const end = toFlattenPoint(lineEnd);

  const line = new Line(start, end);
  return p.projectionOn(line);
}

/**
 * Project a point onto a segment (not the infinite line)
 * Returns the closest point on the segment, which may be an endpoint
 */
export function projectPointOnSegment(point: NxPoint, segment: Segment): NxPoint {
  const p = toFlattenPoint(point);

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
 * Project an edge onto a line
 * Projects both endpoints of the edge onto the line
 */
export function projectEdgeToLine(edge: NxEdge, line: Segment): NxEdge {
  const lineObj = new Line(line.start, line.end);

  const start = toFlattenPoint(edge[0]);
  const end = toFlattenPoint(edge[1]);

  const projectedStart = start.projectionOn(lineObj);
  const projectedEnd = end.projectionOn(lineObj);

  return [fromFlattenPoint(projectedStart), fromFlattenPoint(projectedEnd)];
}

/** Nearest point on a segment to a query point, with the detail an annotation caller needs. */
export interface NearestOnSegment {
  /** Closest point on the segment. */
  point: NxPoint;
  /** Distance from the query point to `point`. */
  distance: number;
  /** Clamped parameter along the edge, 0 at `edge[0]` and 1 at `edge[1]`. */
  t: number;
  /**
   * The perpendicular foot fell *outside* the segment, so `point` is an endpoint
   * and the offset to it is not normal to the segment.
   *
   * A foot landing exactly on an endpoint is **not** clamped: it still lies on
   * the segment and the offset is still perpendicular to it. Callers that need a
   * true perpendicular offset rely on that distinction — two adjacent segments
   * meeting at a shared vertex both report the vertex as unclamped, so neither
   * is discarded.
   */
  clamped: boolean;
}

/** Below this squared length an edge is treated as a single point. */
const DEGENERATE_LENGTH_SQ = 1e-20;
/** Parameter slack so a foot landing on an endpoint is not read as clamped. */
const PARAM_EPSILON = 1e-9;

/**
 * Nearest point on `edge` to `point`, allocation-free.
 *
 * Differs from {@link projectPointOnSegment} in two ways that matter to callers
 * annotating the result: it reports the parameter along the edge and whether the
 * perpendicular foot had to be clamped, and it does no flatten-js conversion — so
 * it is safe to evaluate across many segments every frame.
 */
export function nearestPointOnSegment(point: NxPoint, edge: NxEdge): NearestOnSegment {
  const [[ax, ay], [bx, by]] = edge;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq <= DEGENERATE_LENGTH_SQ) {
    return {
      // A fresh tuple, not `edge[0]`: every other path allocates, and handing back
      // a reference to the graph's own node coordinates invites a caller to mutate
      // them through it.
      point: [ax, ay],
      distance: Math.hypot(point[0] - ax, point[1] - ay),
      t: 0,
      // A zero-length segment has no direction, so no offset to it is perpendicular.
      clamped: true,
    };
  }

  const raw = ((point[0] - ax) * dx + (point[1] - ay) * dy) / lengthSq;
  const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const closest: NxPoint = [ax + t * dx, ay + t * dy];

  return {
    point: closest,
    distance: Math.hypot(point[0] - closest[0], point[1] - closest[1]),
    t,
    clamped: raw < -PARAM_EPSILON || raw > 1 + PARAM_EPSILON,
  };
}

/** The nearest of `edges` to `point`, tagged with its index, or null for an empty set. */
export function nearestPointOnSegments(
  point: NxPoint,
  edges: readonly NxEdge[],
): (NearestOnSegment & { index: number }) | null {
  let best: (NearestOnSegment & { index: number }) | null = null;

  for (let i = 0; i < edges.length; i++) {
    const candidate = nearestPointOnSegment(point, edges[i]!);
    if (!best || candidate.distance < best.distance) {
      best = { ...candidate, index: i };
    }
  }

  return best;
}

/**
 * Clamped parameter of `point` along `edge`, 0 at `edge[0]` and 1 at `edge[1]`.
 * Lets a caller record a position along an edge and restore it after the edge
 * has moved — which a projected point alone cannot express.
 */
export function edgeParameterAt(edge: NxEdge, point: NxPoint): number {
  return nearestPointOnSegment(point, edge).t;
}

/** Inverse of {@link edgeParameterAt} — the point at parameter `t` along `edge`. */
export function pointAtEdgeParameter(edge: NxEdge, t: number): NxPoint {
  const [[ax, ay], [bx, by]] = edge;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + (bx - ax) * clamped, ay + (by - ay) * clamped];
}
