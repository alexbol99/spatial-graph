import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

interface NodeData {
  name: string;
}
interface EdgeData {
  width: number;
  weight?: number;
  label?: 'main' | 'secondary';
}

// Edges and splits create nodes implicitly, so required node fields need a factory.
const graph = new SpatialGraph<NodeData, EdgeData>({
  createNodeAttributes: () => ({ name: '' }),
});
const inserted = graph.addEdge(
  [
    [0, 0],
    [10, 0],
  ],
  { width: 3, weight: 999 },
);
if (inserted.status !== 'collapsed') {
  const width: number = inserted.edge.attributes.width;
  graph.mergeEdgeAttributes(inserted.edge, { width: width + 1 });
  graph.setEdgeLabel(inserted.edge, 'main');
}

assert.notEqual(inserted.status, 'collapsed');
if (inserted.status !== 'collapsed') {
  assert.equal(inserted.edge.attributes.width, 3); // Metadata snapshots also stay old.
  assert.equal(graph.getEdge(inserted.edge)?.attributes.width, 4);
  assert.equal(graph.getEdgeLabel(inserted.edge), 'main');
  assert.equal(graph.getEdgeLength(inserted.edge), 10); // User weight is not geometry.
  assert.equal(graph.getShortestPath([0, 0], [10, 0])?.cost, 10);
  assert.equal(graph.setEdgeLabel(inserted.edge, null), true); // Label is optional.
}
assert.equal(graph.getNode([0, 0])?.attributes.name, '');
assert.equal(graph.mergeNodeAttributes([99, 99], { name: 'missing' }), null);

// clone hooks isolate nested metadata as well as the default copied top level.
const isolated = new SpatialGraph<{ details?: { tags: string[] } }>({
  cloneNodeAttributes: (attributes) => structuredClone(attributes),
});
const attributes = { details: { tags: ['initial'] } };
const snapshot = isolated.addNode([0, 0], attributes);
attributes.details.tags.push('external');
snapshot.attributes.details?.tags.push('snapshot');
assert.deepEqual(isolated.getNode([0, 0])?.attributes.details?.tags, ['initial']);
