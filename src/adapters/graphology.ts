import graphology from 'graphology';
import type { AbstractGraph, GraphConstructor } from 'graphology-types';
import type { StoredEdge, StoredNode } from '../internal/storage.js';

/** Return an independent Graphology graph with derived geometry for consumers. */
export function toGraphology<N extends object, E extends object>(
  graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>,
): AbstractGraph<{ x: number; y: number; data: N }, { length: number; data: E }> {
  const Graph = graphology as unknown as GraphConstructor<
    { x: number; y: number; data: N }, { length: number; data: E }
  >;
  const detached = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
  for (const key of graph.nodes()) {
    const record = graph.getNodeAttributes(key);
    detached.addNode(key, { x: record.x, y: record.y, data: { ...record.data } });
  }
  for (const key of graph.edges()) {
    const [source, target] = graph.extremities(key);
    const a = graph.getNodeAttributes(source);
    const b = graph.getNodeAttributes(target);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    detached.addUndirectedEdgeWithKey(key, source, target, {
      length, data: { ...graph.getEdgeAttributes(key).data },
    });
  }
  return detached;
}
