import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Spatial JSON is the persistence format: geometry, keys, policies, and metadata.
const graph = new SpatialGraph({ coordinatePrecision: 0 });
graph.addEdge(
  [
    [0, 0],
    [10, 0],
  ],
  { name: 'first' },
);
graph.addEdge(
  [
    [10, 0],
    [10, 10],
  ],
  { name: 'second' },
);
graph.setNodeLabel([0, 0], 'origin');
graph.setGraphAttribute('name', 'network');
const restored = SpatialGraph.fromJSON(JSON.parse(JSON.stringify(graph.export())));

assert.deepEqual(restored.export(), graph.export());
assert.equal(restored.coordinatePrecision, 0);
assert.equal(restored.getNodeLabel([0, 0]), 'origin');
assert.equal(restored.getGraphAttribute('name'), 'network');
assert.equal(restored.getShortestPath([0, 0], [10, 10])?.edges.length, 2);
assert.deepEqual(graph.copy().export(), graph.export());

// Export once for an external Graphology algorithm; it is detached and becomes
// stale after edits. Element user metadata is nested under data; length is derived.
const detached = graph.toGraphology();
const originKey = graph.getNodeKey([0, 0]);
assert.equal(detached.degree(originKey), 1);
assert.equal(detached.getNodeAttribute(originKey, 'data').label, 'origin');
assert.equal(detached.getEdgeAttribute(detached.edges()[0]!, 'length'), 10);

// Graphology does not carry SpatialGraph's policies or factories. The current
// adapter also omits graph-level metadata. Preserve those explicitly, or use
// spatial JSON for full-fidelity persistence.
// Policy options do not change metadata types. Defaults need no explicit generics;
// supply custom metadata types explicitly, just as when constructing a graph.
const imported = SpatialGraph.fromGraphology(detached, {
  coordinatePrecision: 0,
});
assert.deepEqual(imported.getEdgeSegments(), graph.getEdgeSegments());
assert.equal(imported.getGraphAttribute('name'), undefined);
imported.replaceGraphAttributes(graph.getGraphAttributes());
assert.deepEqual(imported.export(), graph.export());

graph.moveNode([10, 0], [12, 0]);
assert.equal(detached.hasNode(graph.getNodeKey([10, 0])), true);
assert.equal(detached.hasNode(graph.getNodeKey([12, 0])), false);
detached.dropNode(originKey);
assert.equal(graph.hasNode([0, 0]), true); // External topology edits never write back.
