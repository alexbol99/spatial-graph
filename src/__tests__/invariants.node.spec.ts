import { expect, it } from 'vitest';
import fc from 'fast-check';
import { SpatialGraph } from '../index.js';
import type { Point2D } from '../index.js';

const pair = (a: string, b: string) => [a, b].sort().join('|');

const content = (graph: SpatialGraph) => ({
  nodes: graph
    .getNodes()
    .map((node) => [node.key, node.attributes])
    .sort(),
  edges: graph
    .getEdges()
    .map((edge) => [pair(edge.source.key, edge.target.key), edge.attributes])
    .sort(),
});

it('split then safe join restores generated collinear geometry', () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 })),
      fc.integer({ min: 1, max: 100 }),
      (start, length) => {
        const graph = new SpatialGraph();
        const end: Point2D = [start[0] + length * 2, start[1] + length * 2];
        const edge = graph.addEdge([start, end]);
        if (edge.edge === null) {
          throw new Error('Unexpected collapse');
        }
        const before = content(graph);
        graph.splitEdge(edge.edge, edge.edge.midpoint);
        expect(graph.joinNode(edge.edge.midpoint).changed).toBe(true);
        expect(content(graph)).toEqual(before);
      },
    ),
    { seed: 901, numRuns: 60 },
  );
});
it('generated components partition nodes, decomposition covers edges, and JSON preserves content', () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.integer({ min: -10, max: 10 }), fc.integer({ min: -10, max: 10 })), {
        minLength: 1,
        maxLength: 40,
      }),
      (points) => {
        const graph = new SpatialGraph();
        points.forEach((point) => graph.addNode(point));
        for (let i = 1; i < points.length; i += 2) {
          graph.addEdge([points[i - 1]!, points[i]!]);
        }
        const components = graph.getConnectedComponents();
        const all = components.flat().map((node) => node.key);
        expect(new Set(all).size).toBe(graph.nodeCount);
        expect(all).toHaveLength(graph.nodeCount);
        for (const edge of graph.getEdges()) {
          expect(
            components.some(
              (group) =>
                group.some((node) => node.key === edge.source.key) &&
                group.some((node) => node.key === edge.target.key),
            ),
          ).toBe(true);
        }
        const paths = graph.findPaths();
        const edges = paths.flatMap((path) =>
          path.edges.map((edge) => pair(edge.source.key, edge.target.key)),
        );
        expect(edges).toHaveLength(graph.edgeCount);
        expect(new Set(edges).size).toBe(graph.edgeCount);
        expect(content(SpatialGraph.fromJSON(JSON.parse(JSON.stringify(graph.export()))))).toEqual(
          content(graph),
        );
      },
    ),
    { seed: 902, numRuns: 60 },
  );
});
it('generated move permutations produce the same canonical result', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 10, maxLength: 10 }),
      (targets) => {
        const graph = new SpatialGraph();
        for (let i = 0; i < 10; i++) {
          graph.addNode([i, 0], { id: i });
        }
        for (let i = 1; i < 10; i++) {
          graph.addEdge(
            [
              [i - 1, 0],
              [i, 0],
            ],
            { id: i },
          );
        }
        const other = graph.copy();
        const moves = targets.map(
          (x, i) =>
            [
              [i, 0],
              [x, 1],
            ] as const,
        );
        graph.moveNodes(moves);
        other.moveNodes([...moves].reverse());
        expect(content(graph)).toEqual(content(other));
      },
    ),
    { seed: 903, numRuns: 60 },
  );
});
it('reserves preserved edge keys when planarizing a restored graph', () => {
  const graph = new SpatialGraph();
  graph.addEdge([
    [20, 0],
    [21, 0],
  ]);
  graph.addEdge([
    [0, 0],
    [2, 2],
  ]);
  graph.addEdge([
    [0, 2],
    [2, 0],
  ]);
  const restored = SpatialGraph.fromJSON(graph.export());
  expect(restored.planarize().changed).toBe(true);
  expect(restored.edgeCount).toBe(5);
  expect(restored.planarize().changed).toBe(false);
});
it('runs all clone and conflict callbacks before committing edits', () => {
  let calls = 0;
  const graph = new SpatialGraph({
    cloneEdgeAttributes: (data) => {
      calls++;
      if (calls === 2) {
        throw new Error('clone');
      }
      return data;
    },
  });
  expect(() =>
    graph.addEdge([
      [0, 0],
      [1, 0],
    ]),
  ).toThrow('clone');
  expect(graph.nodeCount).toBe(0);
  expect(graph.edgeCount).toBe(0);
  const other = new SpatialGraph();
  other.addEdge([
    [0, 0],
    [10, 0],
  ]);
  const before = other.export();
  expect(() =>
    other.splitEdge(
      [
        [0, 0],
        [10, 0],
      ],
      [5, 0],
      {
        splitAttributes: () => {
          other.clear();
          return {};
        },
      },
    ),
  ).toThrow(/callback/);
  expect(other.export()).toEqual(before);
});
it('rejects public mutation of coordinate policy and exposes no internal graph reference', () => {
  const graph = new SpatialGraph();
  expect('graph' in graph).toBe(false);
  expect(() => Reflect.set(graph, 'coordinatePrecision', 0)).not.toThrow();
  expect(graph.coordinatePrecision).toBeNull();
});

it('prepares existing-edge snapshot hooks before inserting other batch edges', () => {
  let fail = false;
  const graph = new SpatialGraph({
    cloneEdgeAttributes: (data) => {
      if (fail && data.existing) {
        throw new Error('existing clone');
      }
      return data;
    },
  });
  graph.addEdge(
    [
      [0, 0],
      [1, 0],
    ],
    { existing: true },
  );
  const before = graph.export();
  fail = true;
  expect(() =>
    graph.addEdges([
      {
        endpoints: [
          [2, 0],
          [3, 0],
        ],
        attributes: {},
      },
      {
        endpoints: [
          [0, 0],
          [1, 0],
        ],
        attributes: {},
      },
    ]),
  ).toThrow('existing clone');
  fail = false;
  expect(graph.export()).toEqual(before);
});
it('reports graph-only union metadata as a committed change', () => {
  const graph = new SpatialGraph();
  const other = new SpatialGraph();
  other.setGraphAttribute('labelCounter', 3);
  const revision = graph.revision;
  expect(graph.union(other).changed).toBe(true);
  expect(graph.getGraphAttribute('labelCounter')).toBe(3);
  expect(graph.revision).toBe(revision + 1);
});
