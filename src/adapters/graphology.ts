import graphology from 'graphology';
import type { AbstractGraph, GraphConstructor } from 'graphology-types';
import type { StoredEdge, StoredNode } from '../internal/storage.js';
import { copyData, distance, pointOf } from '../utils/geometry.js';

/** Return an independent Graphology graph with derived geometry for consumers. */
export function toGraphology<N extends object, E extends object>(
  graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>,
  cloneNode: (data: N) => N = copyData,
  cloneEdge: (data: E) => E = copyData,
): AbstractGraph<{ x: number; y: number; data: N }, { length: number; data: E }> {
  const Graph = graphology as unknown as GraphConstructor<
    { x: number; y: number; data: N }, { length: number; data: E }
  >;
  const detached = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
  for (const key of graph.nodes()) {
    const record = graph.getNodeAttributes(key);
    detached.addNode(key, { x: record.x, y: record.y, data: cloneNode(record.data) });
  }
  for (const key of graph.edges()) {
    const [source, target] = graph.extremities(key);
    const a = graph.getNodeAttributes(source);
    const b = graph.getNodeAttributes(target);
    const length = distance(pointOf(a), pointOf(b));
    detached.addUndirectedEdgeWithKey(key, source, target, {
      length, data: cloneEdge(graph.getEdgeAttributes(key).data),
    });
  }
  return detached;
}

import type { SpatialGraphConfig, SpatialGraphJSON } from '../types.js';
import { canonicalPoint, pointKey } from '../internal/coordinates.js';
import { decodeGraphJSON, dictionary } from './serialization.js';

export interface GraphologyMappings<N extends object, E extends object> {
  mapNodeAttributes?: (attributes: Record<string, unknown>) => N;
  mapEdgeAttributes?: (attributes: Record<string, unknown>) => E;
}
/** Validate and copy renderer coordinates and nested user metadata from a detached graph. */
export function decodeGraphology<N extends object, E extends object>(
  graph: AbstractGraph,
  options: SpatialGraphConfig<N, E> & GraphologyMappings<N, E>,
): SpatialGraphJSON<N, E> {
  if (graph.type !== 'undirected' || graph.multi || graph.selfLoopCount) throw new Error('Graphology input must be undirected, simple, and loop-free.');
  graph = graph.copy();
  const precision = options.coordinatePrecision ?? null;
  const data: SpatialGraphJSON<N, E> = { schema: 'spatial-graph', version: 2, options: { coordinatePrecision: precision, positionTolerance: options.positionTolerance ?? 1e-9, straightAngleToleranceDeg: options.straightAngleToleranceDeg ?? 1e-7 }, attributes: { ...graph.getAttributes() }, nodes: [], edges: [] };
  const remap = new Map<string, string>();
  for (const key of graph.nodes()) {
    const attributes = graph.getNodeAttributes(key), point = canonicalPoint([attributes.x, attributes.y], precision), canonical = pointKey(point);
    if (key.includes(',') && key !== canonical) throw new Error('Graphology coordinate key disagrees with canonical x/y; fix the key or coordinates before importing, or use fromLegacyJSON for legacy quantization.');
    remap.set(key, canonical);
    data.nodes.push({ key: canonical, point, attributes: options.mapNodeAttributes ? options.mapNodeAttributes({ ...attributes }) : { ...dictionary(attributes.data) } as N });
  }
  for (const key of graph.edges()) {
    const attributes = graph.getEdgeAttributes(key);
    data.edges.push({ key, source: remap.get(graph.source(key))!, target: remap.get(graph.target(key))!, attributes: options.mapEdgeAttributes ? options.mapEdgeAttributes({ ...attributes }) : { ...dictionary(attributes.data) } as E });
  }
  return decodeGraphJSON(data);
}
