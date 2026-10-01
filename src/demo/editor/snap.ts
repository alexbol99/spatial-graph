import {
  nearestPointOnSegment,
  roundPoint,
  type NxEdge,
  type NxPoint,
  type SpatialGraph,
} from '@flatten-js/spatial-graph';
import { dist, edgeKey } from './util.js';

/** The only two things the editor snaps to. */
export type Snap =
  | { kind: 'vertex'; point: NxPoint }
  | { kind: 'edge'; point: NxPoint; edge: NxEdge };

export type SnapOptions = {
  /** Reach of the vertex snap, in world units. */
  vertexTol: number;
  /** Reach of the edge snap, in world units. */
  edgeTol: number;
  /** Node keys (from `graph.getPointKey`) that are not offered. */
  excludeNodes?: ReadonlySet<string>;
  /** Edge keys (from `edgeKey`) that are not offered. */
  excludeEdges?: ReadonlySet<string>;
};

/** An edge snap closer than this to an endpoint would be a vertex snap. */
const ENDPOINT_CLEARANCE = 1.5;

/**
 * Snap `point` to the graph. A vertex within `vertexTol` wins. Otherwise the
 * nearest edge within `edgeTol` is used, at the foot of the perpendicular, and
 * only when that foot is inside the edge and clear of its ends.
 *
 * The returned point is on the coordinate grid, ready to be used as a node.
 */
export function snapToGraph(
  graph: SpatialGraph,
  point: NxPoint,
  options: SnapOptions,
): Snap | null {
  let vertex: NxPoint | null = null;
  let best = options.vertexTol;
  for (const node of graph.getNodes()) {
    if (options.excludeNodes?.has(graph.getPointKey(node))) continue;
    const d = dist(point, node);
    if (d <= best) {
      best = d;
      vertex = node;
    }
  }
  if (vertex) return { kind: 'vertex', point: vertex };

  let result: Snap | null = null;
  best = options.edgeTol;
  for (const edge of graph.getEdges()) {
    if (options.excludeEdges?.has(edgeKey(graph, edge))) continue;
    const near = nearestPointOnSegment(point, edge);
    if (near.clamped || near.distance > best) continue;
    const foot = roundPoint(near.point);
    if (dist(foot, edge[0]) < ENDPOINT_CLEARANCE || dist(foot, edge[1]) < ENDPOINT_CLEARANCE) {
      continue;
    }
    best = near.distance;
    result = { kind: 'edge', point: foot, edge };
  }
  return result;
}
