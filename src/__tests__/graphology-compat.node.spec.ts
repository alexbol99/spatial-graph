import Graph from 'graphology';
import { expect, it } from 'vitest';
import { PathAlgorithm, SpatialGraph } from '../index.js';

it('uses the installed Graphology version for edits, routing and detached adapters', () => {
  const graph = new SpatialGraph();
  graph.addEdge(
    [
      [0, 0],
      [10, 0],
    ],
    { width: 2 },
  );
  graph.splitEdge(
    [
      [0, 0],
      [10, 0],
    ],
    [5, 0],
  );
  graph.moveNode([5, 0], [5, 1]);
  expect(graph.findNearestNode([5, 1])?.point).toEqual([5, 1]);
  expect(
    graph.getShortestPath([0, 0], [10, 0], { algorithm: PathAlgorithm.AStar })?.length,
  ).toBeCloseTo(2 * Math.sqrt(26));
  const detached = graph.toGraphology();
  expect(detached).toBeInstanceOf(Graph);
  expect(SpatialGraph.fromGraphology(detached).getEdgeSegments()).toEqual(graph.getEdgeSegments());
  detached.clear();
  expect(graph.edgeCount).toBe(2);
});
