import graphology from 'graphology';
import type { AbstractGraph, GraphConstructor } from 'graphology-types';
import { SpatialNode } from '../SpatialNode.js';
import { SpatialEdge } from '../SpatialEdge.js';
import { classifyNode } from '../algorithms/classification.js';
import { snapshotToken } from './snapshotToken.js';
import { copyData } from '../utils/geometry.js';

export interface StoredNode<N extends object> {
  x: number;
  y: number;
  data: N;
}

export interface StoredEdge<E extends object> {
  data: E;
}

/** Construct loop-free, simple Graphology storage. */
export function createStorage<N extends object, E extends object>(): AbstractGraph<
  StoredNode<N>,
  StoredEdge<E>
> {
  const Graph = graphology as unknown as GraphConstructor<StoredNode<N>, StoredEdge<E>>;
  return new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
}

/** Materialize a node without parsing its key into coordinates. */
export function nodeSnapshot<N extends object, E extends object>(
  graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>,
  key: string,
  straightAngleToleranceDeg: number,
  cache?: Map<string, SpatialNode<N>>,
  cloneNode: (data: N) => N = copyData,
): SpatialNode<N> {
  const cached = cache?.get(key);
  if (cached) {
    return cached;
  }
  const record = graph.getNodeAttributes(key);
  const snapshot = new SpatialNode(
    snapshotToken,
    key,
    [record.x, record.y],
    graph.degree(key),
    classifyNode(graph, key, straightAngleToleranceDeg),
    cloneNode(record.data),
  );
  cache?.set(key, snapshot);
  return snapshot;
}

/** Materialize an edge and optionally reuse node snapshots from the same query. */
export function edgeSnapshot<N extends object, E extends object>(
  graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>,
  key: string,
  straightAngleToleranceDeg: number,
  cache?: Map<string, SpatialNode<N>>,
  cloneNode: (data: N) => N = copyData,
  cloneEdge: (data: E) => E = copyData,
): SpatialEdge<N, E> {
  const [source, target] = graph.extremities(key);
  return new SpatialEdge(
    snapshotToken,
    key,
    nodeSnapshot(graph, source, straightAngleToleranceDeg, cache, cloneNode),
    nodeSnapshot(graph, target, straightAngleToleranceDeg, cache, cloneNode),
    cloneEdge(graph.getEdgeAttributes(key).data),
  );
}
