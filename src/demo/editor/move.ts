import { roundPoint, type NxPoint, type SpatialGraph } from '@flatten-js/spatial-graph';
import { EDGE_SNAP_TOL_PX, VERTEX_SNAP_TOL_PX } from './constants.js';
import { snapToGraph } from './snap.js';
import type { Ring } from './types.js';
import { add, dot, incidentEdgeKeys, mul, sub } from './util.js';

export type MoveResult = {
  /** Old node key to new position, for every node that moved. */
  moved: Map<string, NxPoint>;
  /** Where the move is snapping, to be drawn; `null` when it is free. */
  ring: Ring | null;
};

/**
 * Move the vertex at `start` towards `candidate`, on a graph that is in its
 * gesture-start state. Its edges stretch with it, and the target decides topology:
 *
 * - near another vertex: it collapses into that vertex (and if the two were
 *   adjacent, the edge between them disappears);
 * - near the inside of an edge it is not on: that edge is split there and the
 *   vertex merges into the new node, so it connects;
 * - otherwise it lands on `candidate`.
 *
 * @returns the move, plus `final`: where the vertex ended up.
 */
export function moveVertex(
  graph: SpatialGraph,
  start: NxPoint,
  candidate: NxPoint,
  scale: number,
): MoveResult & { final: NxPoint } {
  const snap = snapToGraph(graph, candidate, {
    vertexTol: VERTEX_SNAP_TOL_PX / scale,
    edgeTol: EDGE_SNAP_TOL_PX / scale,
    excludeNodes: new Set([graph.getPointKey(start)]),
    excludeEdges: incidentEdgeKeys(graph, [start]),
  });

  let final: NxPoint;
  let ring: Ring | null = null;
  if (snap?.kind === 'vertex') {
    final = snap.point;
    ring = { at: final, kind: 'collapse' };
  } else if (snap?.kind === 'edge') {
    final = snap.point;
    ring = { at: final, kind: 'snap' };
    graph.splitEdge(snap.edge, final);
  } else {
    final = roundPoint(candidate);
  }

  graph.moveNode(start, final);
  return { moved: new Map([[graph.getPointKey(start), final]]), ring, final };
}

export type SlideOptions = {
  /** The grabbed point, on the run's axis. */
  anchor: NxPoint;
  /** Unit vector perpendicular to the axis: the only direction the nodes may move. */
  normal: NxPoint;
  /** Pointer position at gesture start and now. */
  down: NxPoint;
  pointer: NxPoint;
  scale: number;
};

/**
 * Slide `nodes` along `normal`, on a graph that is in its gesture-start state.
 * Edges outside the set stretch from their shared nodes.
 *
 * The grabbed anchor snaps to a vertex or an edge. The snap only decides how far
 * to slide: the displacement stays on the normal, so a snap never shifts the nodes
 * along their own axis. The offset is rounded once and applied to every node, so
 * the set moves rigidly on the grid.
 */
export function slideAlongNormal(
  graph: SpatialGraph,
  nodes: readonly NxPoint[],
  options: SlideOptions,
): MoveResult {
  const { anchor, normal, down, pointer, scale } = options;
  let distance = dot(sub(pointer, down), normal);
  let ring: Ring | null = null;

  const snap = snapToGraph(graph, add(anchor, mul(normal, distance)), {
    vertexTol: VERTEX_SNAP_TOL_PX / scale,
    edgeTol: EDGE_SNAP_TOL_PX / scale,
    excludeNodes: new Set(nodes.map((node) => graph.getPointKey(node))),
    excludeEdges: incidentEdgeKeys(graph, nodes),
  });
  if (snap) {
    distance = dot(sub(snap.point, anchor), normal);
    ring = { at: snap.point, kind: 'snap' };
  }

  const offset = roundPoint(mul(normal, distance));
  const moved = new Map<string, NxPoint>();
  const moves: Array<[NxPoint, NxPoint]> = [];
  for (const node of nodes) {
    const target = add(node, offset);
    moved.set(graph.getPointKey(node), target);
    moves.push([node, target]);
  }
  graph.moveNodes(moves);
  return { moved, ring };
}
