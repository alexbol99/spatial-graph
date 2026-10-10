import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
const graph = new SpatialGraph();
graph.addEdges([
  { endpoints: [[0, 0], [10, 10]], attributes: {} },
  { endpoints: [[0, 10], [10, 0]], attributes: {} },
  { endpoints: [[0, 2], [10, 2]], attributes: {} },
]);
assert.equal(graph.planarize().changed, true); assert.equal(graph.edgeCount, 9);
assert.equal(graph.getJunctions().length, 3);
assert.equal(graph.getShortestPath([0, 0], [0, 2])!.edges.length, 2);
assert.equal(graph.planarize().changed, false);
