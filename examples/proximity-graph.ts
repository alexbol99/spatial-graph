// Build a graph from points using your own rule for which pairs are connected.
// Here: any two points closer than 8 units. The rule can be anything, such as a
// line-of-sight test or a compatibility check.
import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
import type { NxPoint } from '@flatten-js/spatial-graph';

const points: NxPoint[] = [
  [0, 0],
  [5, 0],
  [5, 5],
  [20, 20], // too far from the others
];
const maxDistance = 8;

const graph = SpatialGraph.createCompleteGraph(
  points,
  (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= maxDistance,
);

const groups = graph.getConnectedComponents();
console.log(`${graph.size} edges, ${groups.length} groups`);

assert.equal(graph.order, 4); // isolated points stay in the graph as nodes
assert.equal(graph.size, 3);
assert.equal(groups.length, 2);
assert.deepEqual(graph.getPointNeighbors([20, 20]), []);
