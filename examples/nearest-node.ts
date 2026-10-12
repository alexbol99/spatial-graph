import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

const graph = new SpatialGraph();
const moving = graph.addNode([0, 0]);
graph.addNode([20, 0]);
const target = [5, 0] as const;
const nearest = graph.findNearestNode(target, { excludeNodes: [moving] });

assert.deepEqual(nearest?.point, [20, 0]);
assert.equal(graph.findNearestNode(target)?.key, moving.key);
assert.equal(
  nearest?.key,
  graph.findNearestNode(target, { excludeNodes: [[0, 0]], scan: true })?.key,
);
assert.equal(graph.findNearestNode(target, { excludeNodes: graph.getNodes() }), null);
assert.equal(new SpatialGraph().findNearestNode(target), null);

// Snapshot exclusions refer to their retained coordinates, not a moving identity.
graph.moveNode(moving, [1, 0]);
assert.deepEqual(graph.findNearestNode(target, { excludeNodes: [moving] })?.point, [1, 0]);

// Coordinate exclusions use the graph's canonical precision; the query remains exact.
const grid = new SpatialGraph({ coordinatePrecision: 0 });
grid.addNode([0, 0]);
grid.addNode([20, 0]);
assert.deepEqual(grid.findNearestNode(target, { excludeNodes: [[0.4, 0]] })?.point, [20, 0]);
