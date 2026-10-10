import type { AbstractGraph } from 'graphology-types';
import { astar, dijkstra, edgePathFromNodePath } from 'graphology-shortest-path';
import { PathAlgorithm } from '../types.js';

/** Delegate pathfinding to Graphology; adapt closed edges and validate the resulting cost. */
export function shortestPath(
  graph: AbstractGraph,
  start: string,
  goal: string,
  costs: ReadonlyMap<string, number | null>,
  algorithm: PathAlgorithm = PathAlgorithm.Dijkstra,
  heuristics: ReadonlyMap<string, number> = new Map(),
): { nodes: string[]; edges: string[]; cost: number } | null {
  // Graphology's weight getter coerces null to 1. Remove closed edges from a
  // copy rather than passing null through or mutating the original adjacency.
  const closedEdges = [...costs].filter(([, cost]) => cost === null).map(([edge]) => edge);
  const searchGraph = closedEdges.length > 0 ? graph.copy() : graph;

  for (const edge of closedEdges) {
    searchGraph.dropEdge(edge);
  }

  const getCost = (edge: string): number => costs.get(edge)!;
  const nodes: string[] | null =
    algorithm === PathAlgorithm.AStar
      ? astar.bidirectional(searchGraph, start, goal, getCost, (node) => heuristics.get(node) ?? 0)
      : dijkstra.bidirectional(searchGraph, start, goal, getCost);

  // Upstream declarations omit null even though both functions return it.
  if (!nodes) {
    return null;
  }

  const edges = edgePathFromNodePath(searchGraph, nodes);
  const cost = edges.reduce((sum, edge) => sum + getCost(edge), 0);

  if (!Number.isFinite(cost)) {
    throw new RangeError('Route cost overflowed; reduce edge costs or coordinate scale.');
  }

  return { nodes, edges, cost };
}
