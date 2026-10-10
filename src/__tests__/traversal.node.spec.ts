import { describe, expect, it } from 'vitest';
import { SpatialGraph, SpatialNode } from '../index.js';
import type { Point2D, TraversalCallback } from '../index.js';

const build = () => {
  const graph = new SpatialGraph();
  graph.addEdges([
    {
      endpoints: [
        [0, 0],
        [1, 0],
      ],
      attributes: {},
    },
    {
      endpoints: [
        [0, 0],
        [0, 1],
      ],
      attributes: {},
    },
    {
      endpoints: [
        [1, 0],
        [2, 0],
      ],
      attributes: {},
    },
    {
      endpoints: [
        [0, 1],
        [0, 2],
      ],
      attributes: {},
    },
    {
      endpoints: [
        [10, 0],
        [11, 0],
      ],
      attributes: {},
    },
  ]);
  graph.addNode([99, 99], { label: 'isolated' });
  return graph;
};

describe('Graphology traversal wrappers', () => {
  it('visits all components with BFS/DFS order and depth reset at roots', () => {
    const graph = build();
    const before = graph.export();
    const revision = graph.revision;
    const breadth: Array<[Point2D, number]> = [];
    const depthFirst: Array<[Point2D, number]> = [];
    const retained: SpatialNode[] = [];
    graph.bfs((node, depth) => {
      expect(node).toBeInstanceOf(SpatialNode);
      expect(Object.isFrozen(node.attributes)).toBe(true);
      breadth.push([node.point, depth]);
      retained.push(node);
    });
    graph.dfs((node, depth) => {
      depthFirst.push([node.point, depth]);
    });
    expect(breadth).toEqual([
      [[0, 0], 0],
      [[1, 0], 1],
      [[0, 1], 1],
      [[2, 0], 2],
      [[0, 2], 2],
      [[10, 0], 0],
      [[11, 0], 1],
      [[99, 99], 0],
    ]);
    expect(depthFirst).toEqual([
      [[0, 0], 0],
      [[0, 1], 1],
      [[0, 2], 2],
      [[1, 0], 1],
      [[2, 0], 2],
      [[10, 0], 0],
      [[11, 0], 1],
      [[99, 99], 0],
    ]);
    expect(retained.at(-1)!.attributes.label).toBe('isolated');
    expect(graph.export()).toEqual(before);
    expect(graph.revision).toBe(revision);
    graph.moveNode([99, 99], [100, 100]);
    expect(retained.at(-1)!.point).toEqual([99, 99]);
  });

  it.each(['bfsFromNode', 'dfsFromNode'] as const)(
    '%s visits only reachable nodes and accepts snapshots',
    (method) => {
      const graph = build();
      graph.addEdge([
        [2, 0],
        [0, 2],
      ]); // A cycle must not revisit nodes.
      const visited: SpatialNode[] = [];
      graph[method](graph.getNode([0, 0])!, (node) => {
        visited.push(node);
      });
      expect(visited).toHaveLength(5);
      expect(new Set(visited.map((node) => node.key)).size).toBe(5);
      expect(visited.every((node) => node.point[0] < 10)).toBe(true);
      const isolated: Array<[Point2D, number]> = [];
      graph[method]([99, 99], (node, depth) => {
        isolated.push([node.point, depth]);
      });
      expect(isolated).toEqual([[[99, 99], 0]]);
    },
  );

  it.each(['bfsFromNode', 'dfsFromNode'] as const)(
    '%s prunes expansion without cancelling already queued branches',
    (method) => {
      const graph = build();
      const visited: Point2D[] = [];
      graph[method]([0, 0], (node) => {
        visited.push(node.point);
        return node.equals(graph.getNode([1, 0])!);
      });
      expect(visited).toHaveLength(4);
      expect(visited).toContainEqual([0, 2]);
      expect(visited).not.toContainEqual([2, 0]);
      const rootOnly: Point2D[] = [];
      graph[method]([0, 0], (node) => {
        rootOnly.push(node.point);
        return true;
      });
      expect(rootOnly).toEqual([[0, 0]]);
    },
  );

  it.each(['bfs', 'dfs'] as const)(
    '%s starts new roots for nodes left unseen by pruning',
    (method) => {
      const graph = build();
      const depths: number[] = [];
      graph[method]((_node, depth) => {
        depths.push(depth);
        return true;
      });
      expect(depths).toEqual(Array(graph.nodeCount).fill(0));
    },
  );

  it('performs no visits for empty graphs or missing starts, and validates inputs', () => {
    const graph = new SpatialGraph();
    const unexpected: TraversalCallback = () => {
      throw new Error('Unexpected visit');
    };
    graph.bfs(unexpected);
    graph.dfs(unexpected);
    graph.bfsFromNode([0, 0], unexpected);
    graph.dfsFromNode([0, 0], unexpected);
    graph.addNode([1, 1]);
    graph.bfsFromNode([0, 0], unexpected);
    graph.dfsFromNode([0, 0], unexpected);
    expect(() => graph.bfsFromNode([NaN, 0], unexpected)).toThrow(/finite/);
    expect(() => graph.dfsFromNode([Infinity, 0], unexpected)).toThrow(/finite/);
    const invalid = null as unknown as TraversalCallback;
    expect(() => graph.bfs(invalid)).toThrow(/callback must be a function/);
    expect(() => graph.dfs(invalid)).toThrow(/callback must be a function/);
    expect(() => graph.bfsFromNode([0, 0], invalid)).toThrow(/callback must be a function/);
    expect(() => graph.dfsFromNode([0, 0], invalid)).toThrow(/callback must be a function/);
  });

  it.each(['bfs', 'dfs', 'bfsFromNode', 'dfsFromNode'] as const)(
    '%s rejects callback mutation/reentrancy and releases the guard after failure',
    (method) => {
      const graph = build();
      const run = (callback: TraversalCallback) => {
        if (method === 'bfs' || method === 'dfs') {
          graph[method](callback);
        } else {
          graph[method]([0, 0], callback);
        }
      };
      const before = graph.export();
      const revision = graph.revision;
      expect(() =>
        run(() => {
          graph.moveNode([0, 0], [5, 5]);
        }),
      ).toThrow(/graph callback/);
      expect(() =>
        run(() => {
          graph.dfs(() => {});
        }),
      ).toThrow(/graph callback/);
      expect(() =>
        run(() => {
          throw new Error('Visitor failed');
        }),
      ).toThrow('Visitor failed');
      expect(graph.export()).toEqual(before);
      expect(graph.revision).toBe(revision);
      let count = 0;
      run(() => {
        count++;
      });
      expect(count).toBeGreaterThan(0);
      expect(graph.removeNode([99, 99])).toBe(true);
    },
  );
});
