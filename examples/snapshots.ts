import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Coordinates identify nodes; queries return values captured at the time of query.
const graph = new SpatialGraph();
graph.addEdge(
  [
    [0, 0],
    [10, 0],
  ],
  { label: 'link' },
);
graph.addEdge([
  [10, 0],
  [10, 10],
]);

const node = graph.getNode([10, 0]);
const edge = graph.getEdgeBetween([0, 0], [10, 0]);
if (node && edge) {
  node.type; // 'corner'
  edge.midpoint; // [5, 0]
  edge.length; // 10
  graph.moveNode(node, [12, 0]);
  node.point; // retained snapshot: [10, 0]
  graph.getNode([10, 0]); // null
  graph.getNode([12, 0]); // fetch the current snapshot
}

assert.ok(node && edge);
assert.equal(node.type, 'corner');
assert.deepEqual(edge.midpoint, [5, 0]);
assert.equal(edge.length, 10);
assert.deepEqual(node.point, [10, 0]);
assert.equal(graph.getNode(node), null); // Snapshot inputs resolve their old coordinates.
assert.deepEqual(graph.getNode([12, 0])?.point, [12, 0]);
assert.equal(graph.getEdge(edge), null);
assert.equal(edge.length, 10); // A retained edge remains readable after replacement.

const origin = graph.getNode([0, 0]);
const moved = graph.getNode([12, 0]);
assert.ok(origin && moved);
assert.equal(origin.distanceTo(moved), 12);
assert.ok(origin.equals(graph.getNode([0, 0])!)); // Value equality, not reference equality.
assert.ok(Object.isFrozen(origin.point));
assert.ok(Object.isFrozen(origin.attributes));

// Missing geometry and metadata queries are null; batch removals return counts.
assert.equal(graph.getNodeType([99, 99]), null);
assert.deepEqual(graph.getNeighbors([99, 99]), []);
assert.equal(graph.removeNode([99, 99]), false);
assert.equal(graph.removeNodes([[99, 99]]), 0);
assert.equal(graph.getGraphAttribute('missing'), undefined);
