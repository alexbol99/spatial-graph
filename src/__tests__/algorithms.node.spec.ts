import { expect, it, describe } from 'vitest';
import fc from 'fast-check';
import { SpatialGraph } from '../index.js';
import type { Segment2D } from '../index.js';
const build = (segments: readonly Segment2D[]) => { const graph = new SpatialGraph(); graph.addEdges(segments.map((endpoints) => ({ endpoints, attributes: {} }))); return graph; };

describe('traversal and routing', () => {
  it('partitions components and covers branches and pure cycles exactly once', () => {
    const graph = build([[[0, 0], [1, 0]], [[1, 0], [2, 0]], [[1, 0], [1, 1]], [[10, 0], [11, 0]], [[11, 0], [10, 1]], [[10, 1], [10, 0]]]);
    graph.addNode([99, 99]);
    expect(graph.getConnectedComponents().map((nodes) => nodes.length)).toEqual([4, 3, 1]);
    const paths = graph.findPaths(); expect(paths.filter((path) => path.closed)).toHaveLength(1);
    const keys = paths.flatMap((path) => path.edges.map((edge) => edge.key));
    expect(keys).toHaveLength(graph.edgeCount); expect(new Set(keys).size).toBe(graph.edgeCount);
    expect(graph.findTerminalPaths([[0, 0], [1, 0], [2, 0]])[0]!.nodes.map((node) => node.point)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });
  it('separates length and custom cost, accepts zero, and closes null-cost edges', () => {
    const graph = build([[[0, 0], [3, 0]], [[3, 0], [6, 0]], [[0, 0], [0, 10]], [[0, 10], [6, 0]]]);
    expect(graph.getShortestPath([0, 0], [6, 0])!.length).toBe(6);
    const route = graph.getShortestPath([0, 0], [6, 0], { cost: (edge) => edge.source.point[1] || edge.target.point[1] ? 0 : 10 })!;
    expect(route.cost).toBe(0); expect(route.length).toBeGreaterThan(20);
    expect(graph.getShortestPath([0, 0], [6, 0], { cost: () => null })).toBeNull();
    expect(graph.getShortestPath([0, 0], [0, 0])!.nodes).toHaveLength(1);
    expect(graph.getShortestPath([0, 0], [99, 99])).toBeNull();
  });
  it('rejects invalid callback costs/heuristics and callback mutation before search', () => {
    const graph = build([[[0, 0], [1, 0]]]), before = graph.export();
    for (const cost of [-1, NaN, Infinity]) expect(() => graph.getShortestPath([0, 0], [1, 0], { cost: () => cost })).toThrow(/cost/);
    expect(() => graph.getShortestPath([0, 0], [1, 0], { algorithm: 'astar', heuristic: () => 1 })).toThrow(/zero/);
    expect(() => graph.getShortestPath([0, 0], [1, 0], { cost: () => { graph.removeNode([0, 0]); return 1; } })).toThrow(/callback/);
    expect(graph.export()).toEqual(before);
  });
  it('finds virtual same-edge, endpoint and multi-edge routes without mutating state', () => {
    const graph = build([[[0, 0], [10, 0]], [[10, 0], [10, 10]]]), before = graph.export(), revision = graph.revision;
    expect(graph.route([2, 1], [8, -1])!.length).toBeCloseTo(6);
    const across = graph.route([2, 1], [11, 8])!;
    expect(across.length).toBeCloseTo(16); expect(across.points).toEqual([[2, 0], [10, 0], [10, 8]]);
    expect(graph.route([0, 0], [10, 10])!.length).toBe(20);
    expect(graph.route([5, 9], [10, 10], { maxSnapDistance: 1 })).toBeNull();
    expect(graph.export()).toEqual(before); expect(graph.revision).toBe(revision);
  });
  it('compares A* with Dijkstra on generated weighted graphs', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 16, maxLength: 16 }), (weights) => {
      const graph = new SpatialGraph(); let index = 0;
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
        if (x < 2) graph.addEdge([[x, y], [x + 1, y]], { cost: weights[index++ % weights.length] });
        if (y < 2) graph.addEdge([[x, y], [x, y + 1]], { cost: weights[index++ % weights.length] });
      }
      const cost = (edge: ReturnType<typeof graph.getEdges>[number]) => edge.attributes.cost as number;
      expect(graph.getShortestPath([0, 0], [2, 2], { algorithm: 'astar', cost })!.cost).toBe(graph.getShortestPath([0, 0], [2, 2], { cost })!.cost);
      expect(graph.getShortestPath([0, 0], [2, 2], { algorithm: 'astar' })!.cost).toBe(graph.getShortestPath([0, 0], [2, 2])!.cost);
    }), { seed: 223, numRuns: 60 });
  });
});

describe('RBush and exact geometry', () => {
  it('keeps exact projections fractional and resolves ties by insertion order', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 }); graph.addEdge([[0, 0], [3, 1]]);
    const projection = graph.findNearestEdge([1, 1])!;
    expect(projection.point[0]).toBeCloseTo(1.2); expect(projection.point[1]).toBeCloseTo(0.4);
    expect(projection.clamped).toBe(false);
    const tied = build([[[0, -1], [2, -1]], [[0, 1], [2, 1]]]);
    expect(tied.findNearestEdge([1, 0])!.edge.key).toBe(tied.getEdges()[0]!.key);
  });
  it('keeps indexed queries equivalent to scan after mixed mutations', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 })), { minLength: 3, maxLength: 30 }), (points) => {
      const graph = new SpatialGraph();
      for (let i = 1; i < points.length; i++) graph.addEdge([points[i - 1]!, points[i]!]);
      const compare = () => {
        for (const point of [[0, 0], [100, -20], [-5, 15]] as const) {
          expect(graph.findNearestNode(point)?.key).toBe(graph.findNearestNode(point, { scan: true })?.key);
          expect(graph.findNearestEdge(point)?.edge.key).toBe(graph.findNearestEdge(point, { scan: true })?.edge.key);
          expect(graph.findNearestEdge(point)?.distance).toBe(graph.findNearestEdge(point, { scan: true })?.distance);
        }
      };
      compare();
      const first = graph.getNodes()[0]; if (first) graph.moveNode(first, [70, 70]); compare();
      const edge = graph.getEdges()[0]; if (edge) graph.splitEdge(edge, edge.midpoint); compare();
      const node = graph.getNodes()[0]; if (node) graph.removeNode(node); compare();
      graph.clear(); compare();
    }), { seed: 345, numRuns: 70 });
  });
  it('nodes crossings, T-junctions and overlaps and is idempotent', () => {
    const crossing = build([[[0, 0], [10, 10]], [[0, 10], [10, 0]], [[0, 2], [10, 2]]]);
    expect(crossing.planarize().changed).toBe(true); expect(crossing.edgeCount).toBe(9); expect(crossing.getJunctions()).toHaveLength(3);
    expect(crossing.planarize().changed).toBe(false);
    const overlap = build([[[0, 0], [10, 0]], [[5, 0], [15, 0]], [[10, 0], [10, 5]]]);
    expect(overlap.planarize().overlaps).toBeGreaterThan(0); expect(overlap.edgeCount).toBe(4);
    expect(overlap.getShortestPath([0, 0], [15, 0])!.length).toBe(15);
    expect(overlap.planarize().changed).toBe(false);
  });
  it('reports incompatible grid intersections without changing any edges', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 }); graph.addEdge([[0, 0], [1, 1]]); graph.addEdge([[0, 1], [1, 0]]);
    const before = graph.export(); expect(graph.planarize()).toMatchObject({ changed: false, unresolved: [[0.5, 0.5]] }); expect(graph.export()).toEqual(before);
  });
  it('merges transitive nearby clusters deterministically and reports displacement', () => {
    const graph = new SpatialGraph(); for (const x of [1.8, 0.9, 0]) graph.addNode([x, 0]);
    const result = graph.mergeNearbyNodes(1);
    expect(result.clusters).toHaveLength(1); expect(result.maxDisplacement).toBeCloseTo(1.8); expect(graph.getNodePoints()).toEqual([[0, 0]]);
  });
});

it('reopens A* nodes for admissible but inconsistent heuristics', () => {
  const graph = new SpatialGraph<{}, { cost: number }>();
  graph.addEdges([
    { endpoints: [[0, 0], [1, 0]], attributes: { cost: 2 } },
    { endpoints: [[0, 0], [0, 1]], attributes: { cost: 1 } },
    { endpoints: [[0, 1], [1, 0]], attributes: { cost: .5 } },
    { endpoints: [[1, 0], [2, 0]], attributes: { cost: 2 } },
    { endpoints: [[0, 1], [2, 0]], attributes: { cost: 100 } },
  ]);
  const path = graph.getShortestPath([0, 0], [2, 0], {
    algorithm: 'astar', cost: (edge) => edge.attributes.cost,
    heuristic: (node) => node.key === '0,1' ? 2.5 : 0,
  });
  expect(path?.cost).toBe(3.5); expect(path?.nodes.map((node) => node.key)).toEqual(['0,0', '0,1', '1,0', '2,0']);
});
