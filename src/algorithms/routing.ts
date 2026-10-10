import { MinHeap } from '../internal/heap.js';
export interface SearchLink { to: string; edge: string; cost: number }
/** Dijkstra/A* with reopening and stable ties. Callers validate all weights and heuristics. */
export function shortestPath(
  start: string, goal: string, neighbors: (key: string) => readonly SearchLink[], heuristic: (key: string) => number,
): { nodes: string[]; edges: string[]; cost: number } | null {
  const costs = new Map([[start, 0]]), previous = new Map<string, { node: string; edge: string }>();
  const queue = new MinHeap<{ key: string; cost: number }>();
  queue.push({ key: start, cost: 0 }, heuristic(start));
  while (queue.size) {
    const current = queue.pop()!.value;
    if (current.cost !== costs.get(current.key)) continue;
    if (current.key === goal) {
      const nodes = [goal], edges: string[] = [];
      let cursor = goal;
      while (cursor !== start) {
        const entry = previous.get(cursor)!;
        edges.push(entry.edge); nodes.push(entry.node); cursor = entry.node;
      }
      return { nodes: nodes.reverse(), edges: edges.reverse(), cost: current.cost };
    }
    for (const link of neighbors(current.key)) {
      const cost = current.cost + link.cost;
      if (!Number.isFinite(cost)) throw new RangeError('Route cost overflowed; reduce edge costs or coordinate scale.');
      if (cost < (costs.get(link.to) ?? Infinity)) {
        costs.set(link.to, cost); previous.set(link.to, { node: current.key, edge: link.edge });
        queue.push({ key: link.to, cost }, cost + heuristic(link.to));
      }
    }
  }
  return null;
}
