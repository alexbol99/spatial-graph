import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
const graph = new SpatialGraph();
graph.addEdges([
  { endpoints: [[0, 0], [10, 0]], attributes: {} },
  { endpoints: [[10, 0], [20, 0]], attributes: {} },
  { endpoints: [[0, 0], [0, 30]], attributes: {} },
  { endpoints: [[0, 30], [20, 30]], attributes: {} },
  { endpoints: [[20, 30], [20, 0]], attributes: {} },
]);
const start = graph.findNearestNode([1, 2])!;
const route = graph.getShortestPath(start, [20, 0], { algorithm: 'astar' })!;
assert.deepEqual(start.point, [0, 0]); assert.equal(route.edges.length, 2); assert.equal(route.length, 20);
assert.equal(graph.route([2, 1], [18, 1])!.length, 16);
