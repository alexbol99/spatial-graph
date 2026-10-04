import type { NxEdge, NxPoint, SpatialGraph } from '@flatten-js/spatial-graph';
import { DEFAULT_WIDTH } from './constants.js';

export const add = (a: NxPoint, b: NxPoint): NxPoint => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: NxPoint, b: NxPoint): NxPoint => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: NxPoint, k: number): NxPoint => [a[0] * k, a[1] * k];
export const dot = (a: NxPoint, b: NxPoint): number => a[0] * b[0] + a[1] * b[1];
export const len = (a: NxPoint): number => Math.hypot(a[0], a[1]);
export const dist = (a: NxPoint, b: NxPoint): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const midpoint = (a: NxPoint, b: NxPoint): NxPoint => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const perp = (a: NxPoint): NxPoint => [-a[1], a[0]];

export function unit(a: NxPoint): NxPoint {
  const l = len(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
}

export const edgeLength = (edge: NxEdge): number => dist(edge[0], edge[1]);

/**
 * Identity of an edge: its two node keys in sorted order. Not a graphology edge
 * key, so it is the same whichever way the edge is oriented.
 */
export function edgeKey(graph: SpatialGraph, edge: NxEdge): string {
  const a = graph.getPointKey(edge[0]);
  const b = graph.getPointKey(edge[1]);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const sameEdge = (graph: SpatialGraph, a: NxEdge, b: NxEdge): boolean =>
  edgeKey(graph, a) === edgeKey(graph, b);

/** The `width` attribute of an edge, `DEFAULT_WIDTH` when it carries none. */
export function widthOf(graph: SpatialGraph, edge: NxEdge): number {
  const width = graph.getEdgeAttributesFor(edge)?.width;
  return typeof width === 'number' ? width : DEFAULT_WIDTH;
}

/** Keys of every edge touching one of `nodes`. */
export function incidentEdgeKeys(graph: SpatialGraph, nodes: readonly NxPoint[]): Set<string> {
  const keys = new Set<string>();
  for (const node of nodes) {
    for (const neighbor of graph.getPointNeighbors(node)) {
      keys.add(edgeKey(graph, [node, neighbor]));
    }
  }
  return keys;
}

/**
 * Follow `edges` through a node move. `moved` maps an old node key to its new
 * position. Edges that vanished (collapsed to a point, or no longer in the graph)
 * are dropped and duplicates removed.
 */
export function remapEdges(
  graph: SpatialGraph,
  edges: readonly NxEdge[],
  moved: ReadonlyMap<string, NxPoint>,
): NxEdge[] {
  const seen = new Set<string>();
  const result: NxEdge[] = [];
  for (const [a, b] of edges) {
    const start = moved.get(graph.getPointKey(a)) ?? a;
    const end = moved.get(graph.getPointKey(b)) ?? b;
    const edge = graph.getEdgeBetweenPoints(start, end);
    if (!edge) continue;
    const key = edgeKey(graph, edge);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
  }
  return result;
}
