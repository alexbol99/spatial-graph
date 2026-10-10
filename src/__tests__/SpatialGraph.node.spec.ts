import { describe, it, expect } from 'vitest';
import { Arc, Multiline, Point, Segment } from '@flatten-js/core';
import { SpatialGraph, SpatialNode, SpatialEdge } from '../index.js';
import type { EdgeRecord, Segment2D } from '../index.js';
const graphOf = (...segments: Segment2D[]) => { const graph = new SpatialGraph(); graph.addEdges(segments.map((endpoints) => ({ endpoints, attributes: {} }))); return graph; };
const geometry = (graph: SpatialGraph) => graph.getEdgeSegments().map((segment) => segment.map((point) => graph.getNodeKey(point)).sort().join('|')).sort();

describe('SpatialGraph composition and edits', () => {
  it('exports only the deliberate runtime surface and snapshots', async () => {
    expect(Object.keys(await import('../index.js')).sort()).toEqual(['SpatialEdge', 'SpatialGraph', 'SpatialNode']);
    const graph = graphOf([[0, 0], [1, 0]]);
    expect(graph.getNode([0, 0])).toBeInstanceOf(SpatialNode);
    expect(graph.getEdges()[0]).toBeInstanceOf(SpatialEdge);
    expect('dropNode' in graph).toBe(false);
  });
  it('inserts batches atomically, reporting duplicates and grid collapses', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 });
    const records: EdgeRecord[] = [{ endpoints: [[0, 0], [1, 0]], attributes: { id: 'first' } }, { endpoints: [[1, 0], [0, 0]], attributes: { id: 'second' } }, { endpoints: [[0, 0], [0.4, 0]], attributes: {} }];
    expect(graph.addEdges(records)).toMatchObject({ added: 1, existing: 1, collapsed: 1 });
    const before = graph.export();
    expect(() => graph.addEdges([...records, { endpoints: [[5, 5], [NaN, 0]], attributes: {} }])).toThrow(/finite/);
    expect(graph.export()).toEqual(before);
    expect(graph.getEdges()[0]!.attributes.id).toBe('first');
  });
  it('rejects unsupported Flatten batches without inserting their earlier segments', () => {
    const graph = new SpatialGraph();
    const line = new Segment(new Point(0, 0), new Point(1, 0));
    expect(() => graph.addFlattenSegments([{ shape: line, attributes: {} }, { shape: new Arc(), attributes: {} }])).toThrow(/approximate arcs/);
    expect(graph.edgeCount).toBe(0);
    graph.addFlattenSegments([{ shape: new Multiline([line, new Segment(new Point(1, 0), new Point(2, 0))]), attributes: { label: 'chain' } }]);
    expect(graph.getEdges().map((edge) => edge.attributes.label)).toEqual(['chain', 'chain']);
  });
  it('keeps geometry separate from metadata and retains exact midpoint on a grid', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 });
    graph.addNode([0, 0], { x: 99, type: 'custom' });
    graph.addEdge([[0, 0], [1, 0]], { weight: 999, length: 'user', id: 'keep' });
    expect(graph.getNode([0, 0])!.point).toEqual([0, 0]);
    expect(graph.getEdgeLength([[0, 0], [1, 0]])).toBe(1);
    expect(graph.getEdgeMidpoint([[0, 0], [1, 0]])).toEqual([0.5, 0]);
    expect(graph.getShortestPath([0, 0], [1, 0])!.cost).toBe(1);
  });
  it('uses stored canonical coordinates for orthogonality and left-turn ordering', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 });
    graph.addEdges([{ endpoints: [[0, 0], [5, 0]], attributes: {} }, { endpoints: [[0, 0], [0, 5]], attributes: {} }]);
    expect(graph.hasOrthogonalEdges([0.49, 0.49], 0)).toBe(true);
    expect(graph.getNeighborsByLeftTurn([0, 0], [1, 0]).map((node) => node.point)).toEqual([[5, 0], [0, 5]]);
    expect(() => graph.hasOrthogonalEdges([0, 0], NaN)).toThrow();
  });
  it('makes missing queries unambiguous without creating elements', () => {
    const graph = new SpatialGraph();
    expect(graph.getNodeDegree([0, 0])).toBeNull();
    expect(graph.getNodeAttributes([0, 0])).toBeNull();
    expect(graph.findNearestEdge([0, 0])).toBeNull();
    expect(graph.findNearestNode([0, 0])).toBeNull();
    expect(graph.getNeighbors([0, 0])).toEqual([]);
    expect(graph.mergeNodeAttributes([0, 0], { label: 'x' })).toBeNull();
    expect(graph.setNodeLabel([0, 0], 'x')).toBe(false);
    expect(graph.removeEdge([[0, 0], [1, 0]])).toBe(false);
  });
  it('moves swaps and chains simultaneously, preserving metadata and old snapshots', () => {
    const graph = graphOf([[0, 0], [1, 0]], [[1, 0], [2, 0]]);
    graph.mergeNodeAttributes([0, 0], { id: 'a' }); graph.mergeNodeAttributes([1, 0], { id: 'b' });
    const old = graph.getNode([0, 0])!;
    graph.moveNodes([[[0, 0], [1, 0]], [[1, 0], [0, 0]]]);
    expect(graph.getNode([1, 0])!.attributes.id).toBe('a');
    expect(graph.getNode([0, 0])!.attributes.id).toBe('b');
    expect(old.point).toEqual([0, 0]);
    expect(geometry(graph)).toEqual(['0,0|1,0', '0,0|2,0']);
    const chain = graphOf([[0, 0], [1, 0]]);
    chain.moveNodes([[[1, 0], [2, 0]], [[0, 0], [1, 0]]]);
    expect(geometry(chain)).toEqual(['1,0|2,0']);
  });
  it('uses deterministic winners for colliding nodes and duplicate edges', () => {
    const create = () => { const g = graphOf([[0, 0], [9, 0]], [[1, 0], [9, 0]]); g.mergeNodeAttributes([0, 0], { label: 'a' }); g.mergeNodeAttributes([1, 0], { label: 'b' }); g.mergeEdgeAttributes([[0, 0], [9, 0]], { label: 'a' }); g.mergeEdgeAttributes([[1, 0], [9, 0]], { label: 'b' }); return g; };
    const a = create(), b = create();
    const moves = [[[1, 0], [2, 0]], [[0, 0], [2, 0]]] as const;
    expect(a.moveNodes(moves)).toMatchObject({ mergedNodes: 1, mergedEdges: 1 });
    b.moveNodes([...moves].reverse());
    expect(a.export()).toEqual(b.export());
    expect(a.getNode([2, 0])!.attributes.label).toBe('a');
    expect(a.getEdge([[2, 0], [9, 0]])!.attributes.label).toBe('a');
  });
  it('preserves stationary destination metadata and reports self-loop collapses', () => {
    const graph = graphOf([[0, 0], [1, 0]], [[0, 0], [2, 0]], [[1, 0], [2, 0]]);
    graph.mergeNodeAttributes([1, 0], { label: 'winner' });
    graph.mergeEdgeAttributes([[1, 0], [2, 0]], { id: 'winner' });
    expect(graph.mergeNodeInto([0, 0], [1, 0])).toMatchObject({ collapsedEdges: 1, mergedEdges: 1 });
    expect(graph.getNode([1, 0])!.attributes.label).toBe('winner');
    expect(graph.getEdges()[0]!.attributes.id).toBe('winner');
  });
  it('rejects invalid move batches and callback failures before storage changes', () => {
    const graph = graphOf([[0, 0], [1, 0]]), before = graph.export();
    expect(() => graph.moveNodes([[[0, 0], [2, 0]], [[99, 0], [3, 0]]])).toThrow(/does not exist/);
    expect(() => graph.moveNodes([[[0, 0], [2, 0]], [[0, 0], [3, 0]]])).toThrow(/conflicting/);
    expect(() => graph.moveNode([0, 0], [1, 0], { mergeNodeAttributes: () => { throw new Error('callback'); } })).toThrow('callback');
    expect(graph.export()).toEqual(before);
    expect(graph.moveNode([0, 0], [0, 0]).changed).toBe(false);
  });
  it('splits only on the segment and keeps application IDs unless callbacks change them', () => {
    const graph = graphOf([[0, 0], [10, 0]]); graph.mergeEdgeAttributes([[0, 0], [10, 0]], { id: 'stable', weight: 50 });
    const before = graph.export();
    expect(() => graph.splitEdge([[0, 0], [10, 0]], [5, 3])).toThrow(/off the edge/);
    expect(graph.export()).toEqual(before);
    expect(graph.splitEdge([[0, 0], [10, 0]], [10, 0]).reason).toBe('endpoint');
    const split = graph.splitEdge([[0, 0], [10, 0]], [5, 0]);
    expect(split.edges.map((edge) => [edge.length, edge.attributes.id, edge.attributes.weight])).toEqual([[5, 'stable', 50], [5, 'stable', 50]]);
    graph.splitEdge(split.edges[0]!, [2, 0], { splitAttributes: (edge, _geometry, index) => ({ ...edge.attributes, id: `piece-${index}` }) });
    expect(graph.getEdge([[0, 0], [2, 0]])!.attributes.id).toBe('piece-0');
  });
  it('rejects precision-displaced splits and can explicitly allow a positional tolerance', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 }); graph.addEdge([[0, 0], [3, 1]]);
    expect(() => graph.splitEdge([[0, 0], [3, 1]], [1.5, 0.5])).toThrow(/quantization/);
    expect(graph.edgeCount).toBe(1);
    const tolerant = new SpatialGraph({ coordinatePrecision: 0, positionTolerance: 0.5 }); tolerant.addEdge([[0, 0], [3, 1]]);
    expect(tolerant.splitEdge([[0, 0], [3, 1]], [1.5, 0.5]).changed).toBe(true);
  });
  it('joins only straight degree-2 nodes; destructive collapse is explicit', () => {
    const straight = graphOf([[0, 0], [1, 0]], [[1, 0], [2, 0]]);
    expect(straight.joinNode([1, 0]).changed).toBe(true); expect(straight.edgeCount).toBe(1);
    const bend = graphOf([[0, 0], [1, 0]], [[1, 0], [1, 1]]);
    expect(bend.joinNode([1, 0]).reason).toBe('bend');
    expect(bend.collapseDegree2Node([1, 0]).changed).toBe(true);
    const triangle = graphOf([[0, 0], [1, 0]], [[1, 0], [0, 1]], [[0, 1], [0, 0]]);
    expect(triangle.joinNode([1, 0]).changed).toBe(false); expect(triangle.edgeCount).toBe(3);
    expect(triangle.collapseDegree2Node([1, 0]).changed).toBe(true); expect(triangle.edgeCount).toBe(1);
  });
  it('copies keys, options, isolated nodes, and all metadata independently', () => {
    const graph = new SpatialGraph({ coordinatePrecision: 0 }); graph.addEdge([[0, 0], [1, 0]], { name: 'keep' }); graph.addNode([9, 9], { label: 'isolated' }); graph.setGraphAttribute('counter', 42);
    const copy = graph.copy(), empty = graph.emptyCopy(), blank = graph.nullCopy();
    expect(copy.export()).toEqual(graph.export()); expect(empty.nodeCount).toBe(3); expect(empty.edgeCount).toBe(0); expect(blank.nodeCount).toBe(0); expect(blank.getGraphAttribute('counter')).toBe(42);
    copy.removeNode([0, 0]); expect(graph.edgeCount).toBe(1);
    expect(graph.getSubgraph((edge) => edge.attributes.name === 'keep', { includeIsolated: true }).export()).toEqual(graph.export());
  });
  it('unions metadata with existing winners and enforces matching graph policies', () => {
    const a = graphOf([[0, 0], [1, 0]]), b = graphOf([[0, 0], [1, 0]], [[1, 0], [2, 0]]);
    a.mergeEdgeAttributes([[0, 0], [1, 0]], { label: 'winner' }); b.mergeEdgeAttributes([[0, 0], [1, 0]], { label: 'other' });
    a.union(b); expect(a.edgeCount).toBe(2); expect(a.getEdgeLabel([[0, 0], [1, 0]])).toBe('winner');
    expect(() => a.union(new SpatialGraph({ coordinatePrecision: 0 }))).toThrow(/policies differ/);
  });
  it('validates strict key lookup and updates/removes labels and graph metadata', () => {
    const graph = graphOf([[0, 0], [1, 0]]); graph.setNodeLabel([0, 0], 'a'); graph.setEdgeLabel([[0, 0], [1, 0]], 'b'); graph.setGraphAttribute('count', 1);
    expect(graph.getNodeByKey('0,0')!.attributes.label).toBe('a');
    expect(() => graph.getNodeByKey('0junk,0')).toThrow(/Malformed/);
    expect(() => graph.getNodeByKey('-0,0')).toThrow(/canonical/);
    graph.setNodeLabel([0, 0], null); graph.setEdgeLabel([[0, 0], [1, 0]], null);
    expect(graph.getNodeLabel([0, 0])).toBeNull(); expect(graph.getEdgeLabel([[0, 0], [1, 0]])).toBeNull();
    graph.clear(); expect(graph.nodeCount).toBe(0); expect(graph.getGraphAttribute('count')).toBe(1);
  });
});

it('validates metadata callbacks and copies the options dictionary', () => {
  expect(() => new SpatialGraph({ createNodeAttributes: false } as never)).toThrow(/must be a function/);
  expect(() => new SpatialGraph(null as never)).toThrow(/dictionary/);
  const options = { createNodeAttributes: () => ({ label: 'original' }) };
  const graph = new SpatialGraph(options); options.createNodeAttributes = () => ({ label: 'changed' });
  graph.addEdge([[0, 0], [1, 0]]); expect(graph.getNodeLabel([0, 0])).toBe('original');
});
