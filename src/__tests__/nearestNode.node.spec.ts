import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SpatialGraph } from '../index.js';
import type { NodeInput, Point2D } from '../index.js';

describe('nearest node exclusion', () => {
  it('searches past the nearest excluded coordinate or snapshot', () => {
    const graph = new SpatialGraph();
    const start = graph.addNode([0, 0]);
    graph.addNode([20, 0]);
    graph.addNode([100, 0]);
    for (const scan of [false, true]) {
      for (const excluded of [start, start.point]) {
        expect(graph.findNearestNode([5, 0], { excludeNodes: [excluded], scan })?.point).toEqual([
          20, 0,
        ]);
      }
    }
  });

  it('returns null for an empty graph or when every node is excluded', () => {
    const graph = new SpatialGraph();
    expect(graph.findNearestNode([0, 0], { excludeNodes: [[0, 0]] })).toBeNull();
    const only = graph.addNode([0, 0]);
    for (const scan of [false, true]) {
      expect(graph.findNearestNode([0, 0], { excludeNodes: [only], scan })).toBeNull();
    }
  });

  it('ignores absent exclusions, deduplicates them, and canonicalizes to the graph grid', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 });
    graph.addNode([0, 0]);
    graph.addNode([20, 0]);
    expect(
      graph.findNearestNode([0.25, 0], {
        excludeNodes: [
          [0.4, 0],
          [0, 0],
          [999, 999],
        ],
      })?.point,
    ).toEqual([20, 0]);
  });

  it('resolves a retained snapshot by its old coordinates, without excluding the moved node', () => {
    const graph = new SpatialGraph();
    const old = graph.addNode([0, 0]);
    graph.addNode([20, 0]);
    graph.moveNode(old, [1, 0]);
    expect(graph.findNearestNode([0, 0], { excludeNodes: [old] })?.point).toEqual([1, 0]);
  });

  it('keeps insertion-order ties after RBush rebalancing and exclusions', () => {
    const graph = new SpatialGraph();
    const tied: Point2D[] = [
      [3, 4],
      [-3, 4],
      [3, -4],
      [-3, -4],
      [4, 3],
      [-4, 3],
      [4, -3],
      [-4, -3],
      [0, 5],
      [0, -5],
      [5, 0],
      [-5, 0],
    ];
    tied.forEach((point) => graph.addNode(point));
    for (let i = 0; i < 100; i++) {
      graph.addNode([100 + i, 100]);
    }
    for (let excludedCount = 0; excludedCount < tied.length; excludedCount++) {
      const excludeNodes = tied.slice(0, excludedCount);
      expect(graph.findNearestNode([0, 0], { excludeNodes })?.point).toEqual(tied[excludedCount]);
      expect(graph.findNearestNode([0, 0], { excludeNodes, scan: true })?.point).toEqual(
        tied[excludedCount],
      );
    }
  });

  it.each([1e200, 1e-200])(
    'keeps exact distance ranking when squaring %s loses precision',
    (scale) => {
      const graph = new SpatialGraph();
      graph.addNode([2 * scale, 0]);
      graph.addNode([scale, 0]);
      graph.addNode([0, 2 * scale]);
      expect(graph.findNearestNode([0, 0])?.point).toEqual([scale, 0]);
      expect(graph.findNearestNode([0, 0])?.key).toBe(
        graph.findNearestNode([0, 0], { scan: true })?.key,
      );
    },
  );

  it('rejects invalid coordinates and exclusions without changing the graph', () => {
    const graph = new SpatialGraph();
    graph.addNode([0, 0]);
    const before = graph.export();
    expect(() => graph.findNearestNode([NaN, 0])).toThrow(/finite/);
    expect(() => graph.findNearestNode([0, 0], { excludeNodes: [[Infinity, 0]] })).toThrow(
      /finite/,
    );
    expect(() =>
      graph.findNearestNode([0, 0], {
        excludeNodes: '0,0' as unknown as NodeInput[],
      }),
    ).toThrow(/excludeNodes/);
    expect(graph.export()).toEqual(before);
  });

  it('matches the reference scan with exclusions after move, merge, split and removal', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 })), {
          minLength: 3,
          maxLength: 40,
        }),
        (points) => {
          const graph = new SpatialGraph();
          points.forEach((point) => graph.addNode(point));
          graph.addEdge([
            [100, 0],
            [200, 0],
          ]);
          const compare = () => {
            const nodes = graph.getNodes();
            const excludeNodes = nodes.filter((_, index) => index % 3 === 0);
            for (const point of [
              [0, 0],
              [100, -20],
              [-5, 15],
            ] as const) {
              expect(graph.findNearestNode(point, { excludeNodes })?.key).toBe(
                graph.findNearestNode(point, { excludeNodes, scan: true })?.key,
              );
            }
          };
          compare();
          graph.moveNode(points[0]!, [100, 0]);
          compare();
          graph.splitEdge(
            [
              [100, 0],
              [200, 0],
            ],
            [150, 0],
          );
          compare();
          graph.removeNode([150, 0]);
          compare();
        },
      ),
      { seed: 201, numRuns: 60 },
    );
  });
});
