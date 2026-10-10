import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '@flatten-js/spatial-graph';
const cjs = createRequire(import.meta.url)('@flatten-js/spatial-graph');
for (const [format, { SpatialGraph, SpatialNode, SpatialEdge, PathAlgorithm }] of [['ESM', esm], ['CJS', cjs]]) {
  const graph = new SpatialGraph();
  const { edge } = graph.addEdge([[0, 0], [10, 0]], { width: 2 });
  assert.ok(edge instanceof SpatialEdge); assert.ok(edge.source instanceof SpatialNode);
  graph.splitEdge(edge, [5, 0]); graph.moveNode([5, 0], [5, 1]);
  const components = graph.getConnectedComponents();
  assert.equal(components.length, 1);
  assert.equal(components[0].length, 3);
  assert.ok(components[0].every(node => node instanceof SpatialNode));
  const counts = [0, 0, 0, 0];
  graph.bfs(() => { counts[0]++; });
  graph.dfs(() => { counts[1]++; });
  graph.bfsFromNode([0, 0], () => { counts[2]++; });
  graph.dfsFromNode(graph.getNode([0, 0]), () => { counts[3]++; });
  assert.deepEqual(counts, [3, 3, 3, 3]);
  assert.deepEqual(graph.findNearestNode([5, 1]).point, [5, 1]);
  assert.equal(graph.findNearestEdge([5, 1]).distance, 0);
  assert.equal(graph.getShortestPath([0, 0], [10, 0], { algorithm: PathAlgorithm.AStar }).edges.length, 2);
  assert.deepEqual(SpatialGraph.fromJSON(graph.export()).getEdgeSegments(), graph.getEdgeSegments());
  assert.equal(graph.getFlattenSegments().length, 2);
  assert.ok(graph.route([1, 0], [9, 0]));
  console.log(`${format} package runtime passed`);
}
