import { readdirSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph, findIntersection } from '../index.js';

// The snippets below are the recipes in README.md and llms.txt. Keep them in sync:
// when a recipe changes there, change it here.
describe('documented recipes', () => {
  const buildUsageGraph = () =>
    new SpatialGraph({
      segments: [
        new Segment(new Point(0, 0), new Point(10, 0)),
        new Segment(new Point(10, 0), new Point(10, 10)),
      ],
    });

  it('usage example', () => {
    const graph = buildUsageGraph();

    expect(graph.getJunctions()).toEqual([]);
    expect(graph.getShortestPath([0, 0], [10, 10])).toHaveLength(2);
    expect(graph.findNearestEdge(new Point(4, 1)).start).toEqual(new Point(0, 0));
  });

  it('route and measure', () => {
    const graph = buildUsageGraph();

    const route = graph.getShortestPath([0, 0], [10, 10]);
    const length = route.reduce((sum, segment) => sum + segment.length, 0);

    expect(length).toBe(20);
    expect(graph.getShortestPath([0, 0], [99, 99])).toEqual([]);
  });

  it('snap a point onto the network and connect it', () => {
    const graph = buildUsageGraph();

    const [snapped, edge] = graph.projectPointOnClosestEdge([4, 3]);
    graph.splitEdge(edge, snapped);
    graph.addSegment(new Segment(new Point(4, 3), new Point(...snapped)));

    expect(snapped).toEqual([4, 0]);
    expect(graph.getPointDegree([4, 0])).toBe(3);
    expect(graph.getShortestPath([4, 3], [10, 10])).toHaveLength(3);
  });

  it('split two crossing edges at their intersection', () => {
    const graph = new SpatialGraph({
      segments: [
        new Segment(new Point(0, 0), new Point(10, 10)),
        new Segment(new Point(0, 10), new Point(10, 0)),
      ],
    });

    const [a, b] = graph.getEdges();
    const crossing = findIntersection(a!, b!);
    if (crossing) {
      graph.splitEdge(a!, crossing);
      graph.splitEdge(b!, crossing);
    }

    expect(crossing).toEqual([5, 5]);
    expect(graph.getJunctions()).toEqual([[5, 5]]);
    expect(graph.size).toBe(4);
    expect(findIntersection([[0, 0], [1, 0]], [[0, 5], [1, 5]])).toBeNull();
  });

  it('clean up a network', () => {
    const graph = new SpatialGraph({
      segments: [
        new Segment(new Point(0, 0), new Point(5, 0)),
        new Segment(new Point(5, 0), new Point(10, 0)),
        new Segment(new Point(10, 0), new Point(10, 10)),
        new Segment(new Point(10, 10), new Point(0, 10)),
        new Segment(new Point(0, 10), new Point(0, 0)),
        new Segment(new Point(10, 10), new Point(15, 15)),
      ],
    });

    graph.getStubs().forEach((point) => graph.removeStubPoint(point));
    graph.removeDegree2PointAndJoin([5, 0]);

    expect(graph.getStubs()).toEqual([]);
    expect(graph.getConnectedComponents()).toHaveLength(1);
    expect(graph.order).toBe(4);
    expect(graph.hasPointNode([5, 0])).toBe(false);
    expect(graph.getEdgeBetweenPoints([0, 0], [10, 0])).not.toBeNull();
  });

  it('connect points by your own rule', () => {
    const points = [[0, 0], [5, 0], [5, 5], [20, 20]] as const;
    const maxDistance = 8;

    const proximity = SpatialGraph.createCompleteGraph(
      [...points],
      (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= maxDistance,
    );

    expect(proximity.size).toBe(3);
    expect(proximity.getConnectedComponents()).toHaveLength(2);
  });

  it('save and load', () => {
    const graph = buildUsageGraph();

    const json = JSON.stringify(graph.export());
    const restored = new SpatialGraph();
    restored.import(JSON.parse(json));

    expect(restored).toBeInstanceOf(SpatialGraph);
    expect(restored.getEdges()).toEqual(graph.getEdges());
    expect(graph.copy()).toBeInstanceOf(SpatialGraph);
    expect(graph.copy().getEdges()).toEqual(graph.getEdges());
  });
});

// Every file in examples/ asserts its own result; running it is the test.
describe('examples', () => {
  const dir = new URL('../../examples/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));

  it('has examples to run', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s runs and its assertions hold', async (name) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // A computed specifier keeps the examples out of the library's own typecheck
    await expect(import(new URL(name, dir).href)).resolves.toBeDefined();
  });
});
