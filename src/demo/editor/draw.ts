import { Point, Segment } from '@flatten-js/core';
import {
  findIntersection,
  nearestPointOnSegment,
  roundPoint,
  type NxEdge,
  type NxPoint,
  type SpatialGraph,
} from '@flatten-js/spatial-graph';
import {
  DEFAULT_WIDTH,
  EDGE_SNAP_TOL_PX,
  MIN_NEW_EDGE_LENGTH,
  ON_EDGE_TOLERANCE,
  VERTEX_SNAP_TOL_PX,
} from './constants.js';
import { isInsideEdge } from './ops.js';
import { snapToGraph, type Snap } from './snap.js';
import type { Hit } from './types.js';
import { dist, edgeKey, widthOf } from './util.js';

/** Where a new edge starts, and the width it takes. */
export type DrawStart = { at: NxPoint; width: number; on: 'vertex' | 'edge' | 'free' };

/**
 * Start of a new edge for a press on `hit`: at a vertex (width of one of its
 * edges), at the foot of the press on an edge (that edge's width), or free
 * (`DEFAULT_WIDTH`). Free starts do not snap.
 */
export function resolveDrawStart(graph: SpatialGraph, hit: Hit, world: NxPoint): DrawStart {
  if (hit.kind === 'vertex') {
    const first = graph.getPointNeighbors(hit.at)[0];
    return { at: hit.at, width: first ? widthOf(graph, [hit.at, first]) : DEFAULT_WIDTH, on: 'vertex' };
  }
  if (hit.kind === 'body' || hit.kind === 'ghost') {
    return { at: roundPoint(nearestPointOnSegment(world, hit.edge).point), width: widthOf(graph, hit.edge), on: 'edge' };
  }
  return { at: roundPoint(world), width: DEFAULT_WIDTH, on: 'free' };
}

export type NewEdgePlan = {
  /** The chain the new edge becomes: start, crossings in order, end. */
  points: NxPoint[];
  width: number;
  /** What the end snapped to, if anything. */
  end: Snap | null;
  /** False when the edge is too short to keep. */
  valid: boolean;
};

/**
 * Plan a new edge from `start` towards `pointer`. Pure: nothing is changed.
 *
 * The end snaps to a vertex or an edge. Every existing edge the segment crosses
 * contributes a point, so the result is a chain, not one long edge over the top.
 */
export function planNewEdge(
  graph: SpatialGraph,
  start: DrawStart,
  pointer: NxPoint,
  scale: number,
): NewEdgePlan {
  const startPoint = roundPoint(start.at);
  const startKey = graph.getPointKey(startPoint);

  // Edges the start sits on (or at the end of) are not offered to the end snap.
  const excludeEdges = new Set<string>();
  for (const edge of graph.getEdges()) {
    if (nearestPointOnSegment(startPoint, edge).distance <= ON_EDGE_TOLERANCE) {
      excludeEdges.add(edgeKey(graph, edge));
    }
  }

  const end = snapToGraph(graph, pointer, {
    vertexTol: VERTEX_SNAP_TOL_PX / scale,
    edgeTol: EDGE_SNAP_TOL_PX / scale,
    excludeNodes: new Set([startKey]),
    excludeEdges,
  });
  const endPoint = end ? end.point : roundPoint(pointer);
  const endKey = graph.getPointKey(endPoint);

  const crossings: NxPoint[] = [];
  const seen = new Set([startKey, endKey]);
  for (const edge of graph.getEdges()) {
    const crossing = findIntersection([startPoint, endPoint], edge);
    if (!crossing) continue;
    const key = graph.getPointKey(crossing);
    if (seen.has(key)) continue;
    seen.add(key);
    crossings.push(crossing);
  }
  crossings.sort((a, b) => dist(startPoint, a) - dist(startPoint, b));

  return {
    points: [startPoint, ...crossings, endPoint],
    width: start.width,
    end,
    valid: startKey !== endKey && dist(startPoint, endPoint) >= MIN_NEW_EDGE_LENGTH,
  };
}

/**
 * Apply a plan: split every existing edge the chain touches in its interior (at
 * the start, the end and each crossing alike), then add one edge per hop.
 * Does nothing for an invalid plan.
 */
export function commitNewEdge(graph: SpatialGraph, plan: NewEdgePlan): boolean {
  if (!plan.valid) return false;

  for (const point of plan.points) {
    const touched: NxEdge[] = graph
      .getEdges()
      .filter((edge) => isInsideEdge(point, edge, ON_EDGE_TOLERANCE));
    for (const edge of touched) graph.splitEdge(edge, point);
  }

  for (let i = 0; i < plan.points.length - 1; i++) {
    const a = plan.points[i]!;
    const b = plan.points[i + 1]!;
    graph.addSegment(new Segment(new Point(a[0], a[1]), new Point(b[0], b[1])), {
      width: plan.width,
    });
  }
  return true;
}
