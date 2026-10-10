import { expect, it } from 'vitest';
import graphology from 'graphology';
import type { GraphConstructor } from 'graphology-types';
import { SpatialGraph } from '../index.js';
import type { Point2D } from '../index.js';
const Graph = graphology as unknown as GraphConstructor;
it('round-trips spatial envelopes and rejects malformed data atomically', () => {
  const graph = new SpatialGraph({ coordinatePrecision: 0 }); graph.addEdge([[0, 0], [3, 4]], { weight: 70, id: 'user' }); graph.addNode([8, 8], { label: 'isolated' }); graph.setGraphAttribute('counter', 7);
  const data = JSON.parse(JSON.stringify(graph.export())), restored = SpatialGraph.fromJSON(data);
  expect(restored.export()).toEqual(data); expect(restored.getShortestPath([0, 0], [3, 4])!.cost).toBe(5);
  const before = graph.export();
  const bad = { ...data, edges: [...data.edges, { ...data.edges[0], key: 'other' }] };
  expect(() => graph.import(bad)).toThrow(/simple/); expect(graph.export()).toEqual(before);
  expect(() => SpatialGraph.fromJSON({ ...data, version: 999 })).toThrow(/version/);
  expect(() => SpatialGraph.fromJSON({ ...data, nodes: [{ ...data.nodes[0], key: '1,1' }] })).toThrow(/inconsistent/);
});
it('round-trips detached Graphology and validates topology, geometry and maps flat attributes', () => {
  const graph = new SpatialGraph(); graph.addEdge([[0, 0], [1, 0]], { label: 'link' });
  const detached = graph.toGraphology(); expect(SpatialGraph.fromGraphology(detached).export()).toEqual(graph.export());
  detached.getNodeAttributes('0,0').data.label = 'external'; expect(graph.getNodeLabel([0, 0])).toBeNull();
  expect(() => SpatialGraph.fromGraphology(new Graph({ type: 'directed' }))).toThrow(/undirected/);
  const flat = new Graph({ type: 'undirected' }); flat.addNode('a', { x: 0, y: 0, name: 'A' }); flat.addNode('b', { x: 1, y: 0, name: 'B' }); flat.addEdge('a', 'b', { width: 3 });
  const mapped = SpatialGraph.fromGraphology<{ name: string }, { width: number }>(flat, { createNodeAttributes: () => ({ name: '' }), mapNodeAttributes: (attributes) => ({ name: attributes.name as string }), mapEdgeAttributes: (attributes) => ({ width: attributes.width as number }) });
  expect(mapped.getEdges()[0]!.attributes.width).toBe(3); expect(mapped.getNode([0, 0])!.attributes.name).toBe('A');
});
it('imports strict legacy keys with explicit collision reports and preserves user weight', () => {
  const legacy = { options: { type: 'undirected', multi: false }, attributes: {}, nodes: [{ key: '0.1,0', attributes: { label: 'first' } }, { key: '0.2,0', attributes: { label: 'second' } }, { key: '1,0', attributes: {} }], edges: [{ key: 'x', source: '0.1,0', target: '0.2,0', attributes: {} }, { key: 'y', source: '0.2,0', target: '1,0', attributes: { weight: 500 } }] };
  const result = SpatialGraph.fromLegacyJSON(legacy, { coordinatePrecision: 0 });
  expect(result.report).toEqual({ mergedNodes: 1, collapsedEdges: 1, mergedEdges: 0 });
  expect(result.graph.getNodeLabel([0, 0])).toBe('first'); expect(result.graph.getEdges()[0]!.attributes.weight).toBe(500); expect(result.graph.getEdges()[0]!.length).toBe(1);
  expect(() => SpatialGraph.fromLegacyJSON({ ...legacy, nodes: [{ key: '0junk,0', attributes: {} }] }, { coordinatePrecision: 0 })).toThrow(/Malformed/);
});
it('round-trips GeoJSON line properties and isolated points; unsupported dimensions throw', () => {
  const graph = SpatialGraph.fromGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'line' }, geometry: { type: 'MultiLineString', coordinates: [[[0.1, 0], [1, 0], [2, 0]]] } }, { type: 'Feature', properties: { label: 'alone' }, geometry: { type: 'Point', coordinates: [8, 8] } }] });
  expect(graph.edgeCount).toBe(2); expect(graph.getNode([0.1, 0])).not.toBeNull();
  expect(SpatialGraph.fromGeoJSON(graph.toGeoJSON()).toGeoJSON()).toEqual(graph.toGeoJSON());
  const feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0, 9], [1, 0, 9]] } };
  expect(() => SpatialGraph.fromGeoJSON(feature)).toThrow(/dimensions/); expect(SpatialGraph.fromGeoJSON(feature, { dropExtraDimensions: true }).edgeCount).toBe(1);
});
it('preserves generic attributes and isolates nested values when clone hooks are configured', () => {
  interface Node { name: string; nested: { value: number } }
  interface Edge { width: number }
  const graph = new SpatialGraph<Node, Edge>({ createNodeAttributes: () => ({ name: '', nested: { value: 1 } }), cloneNodeAttributes: (data) => structuredClone(data) });
  graph.addNode([0, 0], { name: 'origin', nested: { value: 1 } }); graph.addEdge([[0, 0], [1, 0]], { width: 3 });
  const snapshot = graph.getNode([0, 0])!;
  snapshot.attributes.nested.value = 10;
  expect(graph.getNode([0, 0])!.attributes.nested.value).toBe(1);
  const width: number = graph.getEdges()[0]!.attributes.width; expect(width).toBe(3);
  if (false) {
    // @ts-expect-error Required node data needs a factory.
    new SpatialGraph<Node, Edge>();
    // @ts-expect-error Required edge metadata may not be omitted.
    graph.addEdge([[0, 0], [1, 0]]);
    // @ts-expect-error Required node metadata may not be omitted.
    graph.addNode([2, 0]);
    // @ts-expect-error Coordinate snapshots cannot be assigned.
    snapshot.point[0] = 1;
  }
});

it('reports GeoJSON segments collapsed by explicit quantization', () => {
  let counts: { added: number; collapsed: number } | undefined;
  const graph = SpatialGraph.fromGeoJSON({ type: 'Feature', properties: { label: 'tiny' }, geometry: { type: 'LineString', coordinates: [[0, 0], [.1, .1], [2, 0]] } }, {
    coordinatePrecision: 0, onReport: ({ added, collapsed }) => { counts = { added, collapsed }; },
  });
  expect(counts).toEqual({ added: 1, collapsed: 1 }); expect(graph.edgeCount).toBe(1);
});
