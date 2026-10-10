import type { AbstractGraph } from 'graphology-types';
import type { ConflictOptions, MutationReport, Point2D } from '../types.js';
import type { StoredEdge, StoredNode } from './storage.js';
import { copyData, pairKey, pointOf, validateSegment } from '../utils/geometry.js';
import { pointKey } from './coordinates.js';

export interface PlannedEdge<E extends object> { key?: string; source: string; target: string; data: E }
export interface MutationPlan<N extends object, E extends object> {
  removeNodes: string[]; removeEdges: string[];
  nodes: Map<string, StoredNode<N>>; edges: PlannedEdge<E>[];
}
export function emptyPlan<N extends object, E extends object>(): MutationPlan<N, E> {
  return { removeNodes: [], removeEdges: [], nodes: new Map(), edges: [] };
}
export function mergeData<T extends object>(winner: T, incoming: T, callback?: (winner: Readonly<T>, incoming: Readonly<T>) => T): T {
  return callback ? copyData(callback(Object.freeze(copyData(winner)), Object.freeze(copyData(incoming)))) : { ...incoming, ...winner };
}
export function planMoves<N extends object, E extends object>(
  graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>, moves: Map<string, Point2D>, options: ConflictOptions<N, E>,
): { plan: MutationPlan<N, E>; report: MutationReport } {
  const plan = emptyPlan<N, E>();
  const report: MutationReport = { changed: moves.size > 0, moved: [], mergedNodes: 0, mergedEdges: 0, collapsedEdges: 0 };
  const moving = new Set(moves.keys());
  const affected = new Set<string>();
  for (const source of [...moves.keys()].sort()) {
    const point = moves.get(source)!, target = pointKey(point);
    const incoming = graph.getNodeAttributes(source).data;
    const winner = plan.nodes.get(target) ?? (!moving.has(target) && graph.hasNode(target) ? graph.getNodeAttributes(target) : undefined);
    plan.nodes.set(target, { x: point[0], y: point[1], data: winner ? mergeData(winner.data, incoming, options.mergeNodeAttributes) : copyData(incoming) });
    if (winner) report.mergedNodes++;
    report.moved.push({ from: source, to: target });
    for (const edge of graph.edges(source)) affected.add(edge);
  }
  plan.removeNodes = [...moving]; plan.removeEdges = [...affected];
  const byPair = new Map<string, PlannedEdge<E>>();
  const sorted = [...affected].sort((a, b) => {
    const x = pairKey(...graph.extremities(a)), y = pairKey(...graph.extremities(b));
    return x < y ? -1 : x > y ? 1 : 0;
  });
  for (const key of sorted) {
    const [originalSource, originalTarget] = graph.extremities(key);
    const source = moving.has(originalSource) ? pointKey(moves.get(originalSource)!) : originalSource;
    const target = moving.has(originalTarget) ? pointKey(moves.get(originalTarget)!) : originalTarget;
    if (source === target) { report.collapsedEdges++; continue; }
    const sourcePoint = plan.nodes.has(source) ? pointOf(plan.nodes.get(source)!) : pointOf(graph.getNodeAttributes(source));
    const targetPoint = plan.nodes.has(target) ? pointOf(plan.nodes.get(target)!) : pointOf(graph.getNodeAttributes(target));
    validateSegment([sourcePoint, targetPoint]);
    const pair = pairKey(source, target), incoming = graph.getEdgeAttributes(key).data;
    let winner = byPair.get(pair);
    const stationary = graph.hasNode(source) && graph.hasNode(target) ? graph.edge(source, target) : undefined;
    if (!winner && stationary !== undefined && !affected.has(stationary)) {
      const [a, b] = graph.extremities(stationary);
      winner = { key: stationary, source: a, target: b, data: graph.getEdgeAttributes(stationary).data };
    }
    if (winner) {
      byPair.set(pair, { ...winner, data: mergeData(winner.data, incoming, options.mergeEdgeAttributes) });
      report.mergedEdges++;
    } else byPair.set(pair, { key, source, target, data: copyData(incoming) });
  }
  plan.edges = [...byPair.values()];
  return { plan, report };
}
