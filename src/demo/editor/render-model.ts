import type { NxEdge, NxPoint, SpatialGraph } from '@flatten-js/spatial-graph';
import { edgeKey, widthOf } from './util.js';

export type RenderEdge = {
  key: string;
  a: NxPoint;
  b: NxPoint;
  width: number;
};

export type RenderNode = {
  key: string;
  at: NxPoint;
  degree: number;
};

export type RenderModel = { edges: RenderEdge[]; nodes: RenderNode[] };

/** Everything the passive graph layer draws, derived from the graph. */
export function buildRenderModel(graph: SpatialGraph): RenderModel {
  const edges = graph.getEdges().map((edge: NxEdge) => ({
    key: edgeKey(graph, edge),
    a: edge[0],
    b: edge[1],
    width: widthOf(graph, edge),
  }));
  const nodes = graph.getNodes().map((at) => ({
    key: graph.getPointKey(at),
    at,
    degree: graph.getPointDegree(at),
  }));
  return { edges, nodes };
}

/** Bounding box of the graph, widened by the widest edge; `null` for an empty graph. */
export function graphBounds(
  graph: SpatialGraph,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const nodes = graph.getNodes();
  if (nodes.length === 0) return null;
  let pad = 0;
  for (const edge of graph.getEdges()) pad = Math.max(pad, widthOf(graph, edge) / 2);
  const xs = nodes.map((n) => n[0]);
  const ys = nodes.map((n) => n[1]);
  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad,
    maxY: Math.max(...ys) + pad,
  };
}
