import { roundPoint, type NxEdge, type NxPoint, type SpatialGraph } from '@flatten-js/spatial-graph';
import { dist, widthOf } from './util.js';

/**
 * Split `edge` at `at` and return the new vertex, or `null` when nothing was
 * split (the edge is gone, or `at` rounds onto one of its ends).
 */
export function insertVertex(graph: SpatialGraph, edge: NxEdge, at: NxPoint): NxPoint | null {
  const node = roundPoint(at);
  if (!graph.getEdgeBetweenPoints(edge[0], edge[1])) return null;
  if (graph.getPointKey(node) === graph.getPointKey(edge[0])) return null;
  if (graph.getPointKey(node) === graph.getPointKey(edge[1])) return null;
  graph.splitEdge(edge, node);
  return graph.hasPointNode(node) ? node : null;
}

export type RemoveVertexResult = { removed: true } | { removed: false; reason: string };

/**
 * Delete a vertex. A dead end goes with its edge; a pass-through vertex is
 * removed and its two neighbours are joined (the joined edge takes the wider
 * width). A junction (three or more edges) is refused.
 */
export function removeVertex(graph: SpatialGraph, at: NxPoint): RemoveVertexResult {
  if (!graph.hasPointNode(at)) return { removed: false, reason: 'There is no vertex there.' };

  const degree = graph.getPointDegree(at);
  if (degree <= 1) {
    graph.removePoint(at);
    return { removed: true };
  }

  if (degree > 2) {
    return {
      removed: false,
      reason: `This vertex joins ${degree} edges. Delete some of its edges first, then the vertex.`,
    };
  }

  const [first, second] = graph.getPointNeighbors(at) as [NxPoint, NxPoint];
  // Joining would duplicate an edge; the library then drops the vertex and both edges.
  if (graph.getEdgeBetweenPoints(first, second)) {
    return {
      removed: false,
      reason: 'Its two neighbours are already connected, so joining them would duplicate an edge.',
    };
  }

  const width = Math.max(widthOf(graph, [at, first]), widthOf(graph, [at, second]));
  graph.removeDegree2PointAndJoin(at, { width });
  return { removed: true };
}

/** Remove nodes left without edges. Dead ends (one edge) are kept. */
export function pruneIsolated(graph: SpatialGraph): void {
  for (const node of graph.getNodes()) {
    if (graph.getPointDegree(node) === 0) graph.removePoint(node);
  }
}

/** Remove `edges`, then any node they leave isolated. */
export function removeEdges(graph: SpatialGraph, edges: readonly NxEdge[]): void {
  for (const edge of edges) graph.removeEdge(edge);
  pruneIsolated(graph);
}

/** Whether `point` lies strictly inside `edge`, within `tolerance` of its line and clear of its ends. */
export function isInsideEdge(point: NxPoint, edge: NxEdge, tolerance: number): boolean {
  const length = dist(edge[0], edge[1]);
  if (length === 0) return false;
  const along =
    ((point[0] - edge[0][0]) * (edge[1][0] - edge[0][0]) +
      (point[1] - edge[0][1]) * (edge[1][1] - edge[0][1])) /
    length;
  const across =
    Math.abs(
      (point[0] - edge[0][0]) * (edge[1][1] - edge[0][1]) -
        (point[1] - edge[0][1]) * (edge[1][0] - edge[0][0]),
    ) / length;
  return across <= tolerance && along > tolerance && along < length - tolerance;
}
