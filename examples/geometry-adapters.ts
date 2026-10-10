import assert from 'node:assert/strict';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Flatten objects enter through explicit adapters; ordinary graph methods use tuples.
const graph = new SpatialGraph();
graph.addFlattenSegment(new Segment(new Point(0, 0), new Point(10, 0)), { label: 'line' });
graph.addNode([20, 20], { label: 'isolated' });
graph.mergeNodeAttributes([0, 0], { label: 'connected' });
assert.equal(graph.getFlattenSegments()[0]?.length, 10);
assert.equal(graph.getNode([0, 0])?.toFlattenPoint().x, 0);

// GeoJSON uses Cartesian units here. LineStrings carry edge metadata; only
// isolated nodes have Point features. Use spatial JSON to retain ALL node data.
const geojson = graph.toGeoJSON();
const restored = SpatialGraph.fromGeoJSON(geojson);
assert.equal(geojson.features.length, 2);
assert.equal(
  restored.getEdgeLabel([
    [0, 0],
    [10, 0],
  ]),
  'line',
);
assert.equal(restored.getNodeLabel([20, 20]), 'isolated');
assert.equal(restored.getNodeLabel([0, 0]), null);
assert.equal(SpatialGraph.fromJSON(graph.export()).getNodeLabel([0, 0]), 'connected');

// Reject extra dimensions by default; dropping them must be an explicit decision.
const dimensional = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0, 5],
      [10, 0, 5],
    ],
  },
};
assert.throws(() => SpatialGraph.fromGeoJSON(dimensional), /dimension/);
assert.equal(SpatialGraph.fromGeoJSON(dimensional, { dropExtraDimensions: true }).edgeCount, 1);
