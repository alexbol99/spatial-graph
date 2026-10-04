import type { NxEdge, NxPoint, SpatialGraph } from '@flatten-js/spatial-graph';
import { RUN_ANGLE_TOLERANCE_DEG, RUN_WIDTH_TOLERANCE } from './constants.js';
import type { Run } from './types.js';
import { edgeKey, sub, unit, dot, widthOf } from './util.js';

/**
 * Split the graph into runs: maximal chains of edges that are collinear and share
 * one width. A run passes straight through a junction when a collinear,
 * same-width edge continues on the far side; the other arms start runs of their own.
 *
 * At a node, edges are paired greedily by how close the pair is to a straight
 * line, and an edge takes part in at most one pair per node. So two near-parallel
 * arms on the same side of a node do not both attach to the edge opposite them.
 */
export function detectRuns(graph: SpatialGraph): Run[] {
  const edges = graph.getEdges();
  const widths = edges.map((edge) => widthOf(graph, edge));
  const indexOf = new Map(edges.map((edge, i) => [edgeKey(graph, edge), i]));

  const parent = edges.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };

  for (const node of graph.getNodes()) {
    const arms = graph.getPointNeighbors(node).flatMap((neighbor) => {
      const i = indexOf.get(edgeKey(graph, [node, neighbor]));
      return i === undefined ? [] : [{ i, dir: unit(sub(neighbor, node)) }];
    });

    const pairs: Array<{ a: number; b: number; deviation: number }> = [];
    for (let x = 0; x < arms.length; x++) {
      for (let y = x + 1; y < arms.length; y++) {
        const p = arms[x]!;
        const q = arms[y]!;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot(p.dir, q.dir)))) * (180 / Math.PI);
        const deviation = 180 - angle;
        const sameWidth = Math.abs(widths[p.i]! - widths[q.i]!) <= RUN_WIDTH_TOLERANCE;
        if (deviation <= RUN_ANGLE_TOLERANCE_DEG && sameWidth) {
          pairs.push({ a: p.i, b: q.i, deviation });
        }
      }
    }

    const used = new Set<number>();
    for (const pair of pairs.sort((l, r) => l.deviation - r.deviation)) {
      if (used.has(pair.a) || used.has(pair.b)) continue;
      used.add(pair.a);
      used.add(pair.b);
      parent[find(pair.a)] = find(pair.b);
    }
  }

  const groups = new Map<number, NxEdge[]>();
  edges.forEach((edge, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(edge);
    else groups.set(root, [edge]);
  });

  return [...groups.values()].map((group) => buildRun(graph, group));
}

/** Runs keyed by the key of each of their edges. */
export function indexRuns(graph: SpatialGraph, runs: readonly Run[]): Map<string, Run> {
  const index = new Map<string, Run>();
  for (const run of runs) {
    for (const edge of run.edges) index.set(edgeKey(graph, edge), run);
  }
  return index;
}

function buildRun(graph: SpatialGraph, edges: NxEdge[]): Run {
  const width = widthOf(graph, edges[0]!);
  const arms = new Map<string, NxPoint[]>();
  const nodeAt = new Map<string, NxPoint>();
  for (const [a, b] of edges) {
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const key = graph.getPointKey(from);
      nodeAt.set(key, from);
      const list = arms.get(key);
      if (list) list.push(to);
      else arms.set(key, [to]);
    }
  }

  // An open chain has exactly two nodes with a single arm; walk it end to end.
  const ends = [...arms.entries()].filter(([, list]) => list.length === 1).map(([key]) => key);
  if (ends.length !== 2) {
    const nodes = [...nodeAt.values()];
    return { edges, nodes, width, axis: edges[0]! };
  }

  const nodes: NxPoint[] = [];
  let previous: string | null = null;
  let current: string | null = ends[0]!;
  while (current !== null) {
    nodes.push(nodeAt.get(current)!);
    const forward: string | undefined = (arms.get(current) ?? [])
      .map((next) => graph.getPointKey(next))
      .find((next) => next !== previous);
    previous = current;
    current = forward ?? null;
  }
  return { edges, nodes, width, axis: [nodes[0]!, nodes[nodes.length - 1]!] };
}
