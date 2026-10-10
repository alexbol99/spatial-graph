import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
import type { Point2D } from '@flatten-js/spatial-graph';

const graph = new SpatialGraph();
graph.addEdge([
  [0, 0],
  [1, 0],
]);
graph.addEdge([
  [0, 0],
  [0, 1],
]);
graph.addEdge([
  [1, 0],
  [2, 0],
]);
graph.addNode([99, 99]); // Isolated nodes are included by whole-graph traversals.

const breadth: Array<[Point2D, number]> = [];
graph.bfsFromNode([0, 0], (node, depth) => {
  breadth.push([node.point, depth]);
  return depth >= 1; // Skip expansion here; other queued nodes are still visited.
});
const depthFirst: Point2D[] = [];
graph.dfsFromNode(graph.getNode([0, 0])!, (node) => {
  depthFirst.push(node.point);
});
let breadthCount = 0;
let depthCount = 0;
graph.bfs(() => {
  breadthCount++;
});
graph.dfs(() => {
  depthCount++;
});

assert.deepEqual(breadth, [
  [[0, 0], 0],
  [[1, 0], 1],
  [[0, 1], 1],
]);
assert.deepEqual(depthFirst, [
  [0, 0],
  [0, 1],
  [1, 0],
  [2, 0],
]);
assert.equal(breadthCount, graph.nodeCount);
assert.equal(depthCount, graph.nodeCount);
graph.bfsFromNode([999, 999], () => {
  assert.fail('Missing starts make no visits');
});
graph.dfsFromNode([999, 999], () => {
  assert.fail('Missing starts make no visits');
});
assert.throws(
  () =>
    graph.dfs(() => {
      graph.clear();
    }),
  /graph callback/,
);
assert.equal(graph.nodeCount, 5);
