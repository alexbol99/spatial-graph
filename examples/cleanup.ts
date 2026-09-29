// Clean up a noisy network: drop stray islands, short dead-end burrs, and
// redundant pass-through nodes.
import assert from 'node:assert/strict';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '@flatten-js/spatial-graph';

const line = (x1: number, y1: number, x2: number, y2: number) =>
  new Segment(new Point(x1, y1), new Point(x2, y2));

const graph = new SpatialGraph({
  segments: [
    // A square, with the bottom side split at [5, 0]
    line(0, 0, 5, 0),
    line(5, 0, 10, 0),
    line(10, 0, 10, 10),
    line(10, 10, 0, 10),
    line(0, 10, 0, 0),
    // A one-unit burr on a corner
    line(10, 10, 11, 10),
    // A separate island far away
    line(100, 100, 110, 100),
  ],
});

// 1. Keep only the largest connected component.
const [largest, ...islands] = graph.getConnectedComponents().sort((a, b) => b.length - a.length);
graph.removePoints(islands.flat());

// 2. Remove dead ends that are shorter than 3 units.
for (const stub of graph.getStubs()) {
  const [neighbor] = graph.getPointNeighbors(stub);
  if (neighbor && graph.getPathLength([stub, neighbor]) < 3) {
    graph.removeStubPoint(stub);
  }
}

// 3. Join the two halves of the split side into one edge.
graph.removeDegree2PointAndJoin([5, 0]);

console.log(`${largest!.length} nodes kept in the main network; now ${graph.order} nodes, ${graph.size} edges`);

assert.equal(graph.getConnectedComponents().length, 1);
assert.equal(graph.order, 4);
assert.equal(graph.size, 4);
assert.equal(graph.getStubs().length, 0);
