import type { AbstractGraph } from 'graphology-types';
import type { StoredNode, StoredEdge } from '../internal/storage.js';
export interface KeyPath { nodes: string[]; edges: string[] }

export function components<N extends object, E extends object>(graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>): string[][] {
  const visited = new Set<string>(), result: string[][] = [];
  for (const start of graph.nodes()) {
    if (visited.has(start)) continue;
    const queue = [start]; visited.add(start);
    for (let head = 0; head < queue.length; head++) {
      for (const neighbor of graph.neighbors(queue[head]!)) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    result.push(queue);
  }
  return result;
}
/** Maximal degree-2 chains and pure cycles, each included edge visited once. */
export function decompose<N extends object, E extends object>(
  graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>, subset?: Set<string>,
): KeyPath[] {
  const edges = graph.edges().filter((key) => graph.extremities(key).every((node) => !subset || subset.has(node)));
  const adjacency = new Map<string, string[]>();
  for (const key of graph.nodes()) if (!subset || subset.has(key)) adjacency.set(key, []);
  for (const edge of edges) for (const node of graph.extremities(edge)) adjacency.get(node)!.push(edge);
  const used = new Set<string>(), result: KeyPath[] = [];
  const walk = (start: string, firstEdge: string) => {
    const path: KeyPath = { nodes: [start], edges: [] };
    let node = start, edge: string | undefined = firstEdge;
    while (edge && !used.has(edge)) {
      used.add(edge); path.edges.push(edge);
      node = graph.opposite(node, edge); path.nodes.push(node);
      const incident = adjacency.get(node)!;
      if (incident.length !== 2) break;
      edge = incident.find((key) => !used.has(key));
    }
    result.push(path);
  };
  for (const [node, incident] of adjacency) {
    if (incident.length !== 2) for (const edge of incident) if (!used.has(edge)) walk(node, edge);
  }
  for (const edge of edges) if (!used.has(edge)) walk(graph.source(edge), edge);
  return result;
}
