import { describe, expect, it } from 'vitest';
import { SpatialGraph } from '../SpatialGraph.next.js';

describe('redesign foundation', () => {
  it('canonicalizes coordinates once for membership, geometry, and keys', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 });
    graph.addNode([10.2, -0], { label: 'first' });
    graph.addNode([10.4, 0], { label: 'second' });

    expect(graph.nodeCount).toBe(1);
    expect(graph.getNodeKey([10.4, -0])).toBe('10,0');
    expect(graph.getNode([10.49, 0])?.point).toEqual([10, 0]);
    expect(graph.getNode([10, 0])?.attributes.label).toBe('second');
    expect(graph.getNode([10, 0])?.key).toBe('10,0');
  });

  it('keeps returned nodes and edges as detached, shallow snapshots', () => {
    const nested = { value: 1 };
    const graph = new SpatialGraph<{ label?: string }, { nested: { value: number } }>({
      createNodeAttributes: () => ({}),
    });
    const inserted = graph.addEdge([[0, 0], [3, 4]], { nested });
    expect(inserted.status).toBe('added');
    const node = graph.getNode([0, 0])!;
    const edge = graph.getEdge([[0, 0], [3, 4]])!;
    expect(edge.length).toBe(5);
    expect(edge.midpoint).toEqual([1.5, 2]);
    expect(edge.toFlattenSegment().length).toBe(5);
    expect(Object.isFrozen(node.point)).toBe(true);
    expect(Object.isFrozen(edge.endpoints)).toBe(true);
    expect(Object.isFrozen(edge.attributes)).toBe(true);

    graph.mergeNodeAttributes([0, 0], { label: 'new' });
    graph.removeEdge(edge);
    graph.removeNode(node);
    expect(node.type).toBe('stub');
    expect(node.attributes.label).toBeUndefined();
    expect(edge.length).toBe(5);
    expect(graph.getNode([0, 0])).toBeNull();
    expect(graph.getEdge(edge)).toBeNull();
    expect(edge.attributes.nested).toBe(nested);
  });

  it('classifies topology from stored coordinates and compares geometric identity', () => {
    const graph = new SpatialGraph({ createNodeAttributes: () => ({}) });
    graph.addNode([20, 20], {});
    graph.addEdge([[0, 0], [1, 0]], {});
    graph.addEdge([[1, 0], [2, 0]], {});
    expect(graph.getNodeType([20, 20])).toBe('isolated');
    expect(graph.getNodeType([0, 0])).toBe('stub');
    expect(graph.getNodeType([1, 0])).toBe('intermediate');
    graph.addEdge([[1, 0], [1, 1]], {});
    expect(graph.getNodeType([1, 0])).toBe('junction');
    graph.removeEdge([[1, 0], [2, 0]]);
    expect(graph.getNodeType([1, 0])).toBe('corner');
    expect(graph.getNodeDegree([99, 99])).toBeNull();

    const a = graph.getNode([0, 0])!;
    const b = graph.getNode([1, 0])!;
    expect(a.equals(graph.getNode([0, 0])!)).toBe(true);
    expect(a.distanceTo(b)).toBe(1);
    expect(graph.getEdge([[0, 0], [1, 0]])!.equals(graph.getEdge([[1, 0], [0, 0]])!)).toBe(true);
  });

  it('validates input before insertion and reports collapsed and duplicate edges', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 });
    graph.addNode([0, 0], {});
    graph.addNode([1, 0], {});
    expect(graph.addEdge([[0, 0], [0.4, 0]], {}).status).toBe('collapsed');
    expect(graph.nodeCount).toBe(2);
    expect(graph.edgeCount).toBe(0);
    expect(graph.addEdge([[0, 0], [1, 0]], {}).status).toBe('added');
    expect(graph.addEdge([[1, 0], [0, 0]], {}).status).toBe('existing');
    expect(() => graph.addEdge([[1, 0], [Number.NaN, 0]], {})).toThrow(/finite/);
    expect(graph.edgeCount).toBe(1);
    expect(() => graph.addEdge([[1, 0], [2, 0]], {})).toThrow(/Add them with addNode/);
    expect(graph.nodeCount).toBe(2);
  });

  it('exports a detached Graphology graph with derived geometry and copied metadata', () => {
    const graph = new SpatialGraph({ createNodeAttributes: () => ({}) });
    graph.addEdge([[0, 0], [3, 4]], { label: 'link' });
    const detached = graph.toGraphology();
    expect(detached.getNodeAttributes('0,0')).toEqual({ x: 0, y: 0, data: {} });
    const edgeKey = detached.edge('0,0', '3,4')!;
    expect(detached.getEdgeAttributes(edgeKey)).toEqual({ length: 5, data: { label: 'link' } });
    detached.dropNode('0,0');
    expect(graph.nodeCount).toBe(2);
    expect(graph.edgeCount).toBe(1);
  });

  it('rejects invalid precision, angle, and non-finite coordinates', () => {
    expect(() => new SpatialGraph({ coordinatePrecision: 16 })).toThrow(/coordinatePrecision/);
    expect(() => new SpatialGraph({ straightAngleToleranceDeg: 90 })).toThrow(/straightAngleToleranceDeg/);
    const graph = new SpatialGraph();
    expect(() => graph.addNode([Infinity, 0], {})).toThrow(/finite/);
    expect(() => graph.getNodeKey([1e308, 0])).not.toThrow();
    const quantized = new SpatialGraph({ coordinatePrecision: 15 });
    expect(() => quantized.getNodeKey([1e308, 0])).toThrow(/quantized/);
    const withFactory = new SpatialGraph({ createNodeAttributes: () => ({}) });
    expect(() => withFactory.addEdge([[-1e308, 0], [1e308, 0]], {})).toThrow(/length must be finite/);
    expect(withFactory.nodeCount).toBe(0);
  });
});
