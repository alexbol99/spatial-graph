// Save a graph as JSON and load it back, using graphology's own format.
//
// Node keys are derived from coordinates, so nothing else is needed. Load into a
// new SpatialGraph. graph.copy() also preserves SpatialGraph methods.
import assert from 'node:assert/strict';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '@flatten-js/spatial-graph';

const graph = new SpatialGraph({
  segments: [
    new Segment(new Point(0, 0), new Point(10, 0)),
    new Segment(new Point(10, 0), new Point(10, 10)),
  ],
  attrs: [{ name: 'first' }, { name: 'second' }],
});
graph.setNodeLabel([0, 0], 'origin');

const json = JSON.stringify(graph.export());

const restored = new SpatialGraph();
restored.import(JSON.parse(json));

console.log(`restored ${restored.order} nodes and ${restored.size} edges`);

assert.ok(restored instanceof SpatialGraph);
assert.deepEqual(restored.getEdges(), graph.getEdges());
assert.equal(restored.getNodeLabel([0, 0]), 'origin');
assert.equal(restored.getEdgeAttributesFor([[10, 0], [10, 10]])?.name, 'second');
assert.equal(restored.getShortestPath([0, 0], [10, 10]).length, 2);

const copied = graph.copy();
assert.ok(copied instanceof SpatialGraph);
assert.deepEqual(copied.getEdges(), graph.getEdges());
assert.equal(copied.getShortestPath([0, 0], [10, 10]).length, 2);
