import { describe, it, expect } from 'vitest';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '../index.js';
import type { EdgeAttributes } from '../index.js';
import {
  describeEdges,
  edgeId,
  ensureEditingIds,
  loadStored,
  pointId,
  readFixture,
  toStored,
} from './fixtures/consumer/adapter.js';

// Baseline for the refactor (docs/consumer-inventory.md, Phase 0): the library
// behavior the consuming editor relies on, recorded on 1.0.x before anything
// changes. The fixtures are synthetic, whole-centimetre networks shaped like the
// consumer's stored data. See fixtures/consumer/adapter.ts for the load/store
// code these tests share with the consumer's contract.
//
// Each expectation records what the current library does, quirks included. A
// quirk is marked "Baseline quirk" and names the audit finding. When a later
// phase changes one on purpose, change the expectation here in the same commit
// and say so in the docs; never edit one silently.
//
// Fixture map (cm):
//
//   (0,0)---(400,0)---------(900,0)--(900,250)--(900,500)---(1400,500)
//              |                                    |  \          |
//           (400,600)                               |   +---------+
//              \                                 (900,1000)--(1400,1000)
//            (700,900)                                   edge 900,500|900,1000 is 200 wide
//
//   (2000,0)---(2400,0)     separate component

const stored = () => readFixture('stored-skeleton.json');
const load = () => loadStored(stored());

describe('consumer baseline: loading and queries', () => {
  it('builds one node per distinct endpoint and one edge per coordinate pair', () => {
    const graph = load();

    expect([graph.order, graph.size]).toEqual([12, 11]);
    expect(graph.getJunctions()).toEqual([
      [400, 0],
      [900, 500],
    ]);
    expect(graph.getStubs()).toEqual([
      [0, 0],
      [700, 900],
      [2000, 0],
      [2400, 0],
    ]);
  });

  it('keeps insertion order for nodes, edges and neighbours, and the edge orientation it was given', () => {
    const graph = load();

    expect(graph.getEdges().map((edge) => edge.map(pointId).join('>'))).toEqual([
      '0,0>400,0',
      '400,0>900,0',
      '900,0>900,250',
      '900,250>900,500',
      '900,500>900,1000',
      '900,500>1400,500',
      '1400,500>1400,1000',
      '1400,1000>900,1000',
      '400,0>400,600',
      '400,600>700,900',
      '2000,0>2400,0',
    ]);
    expect(graph.getNodes().map(pointId)).toEqual([
      '0,0',
      '400,0',
      '900,0',
      '900,250',
      '900,500',
      '900,1000',
      '1400,500',
      '1400,1000',
      '400,600',
      '700,900',
      '2000,0',
      '2400,0',
    ]);
    expect(graph.getPointNeighbors([400, 0]).map(pointId)).toEqual(['0,0', '900,0', '400,600']);
    expect(graph.getPointNeighbors([900, 500]).map(pointId)).toEqual([
      '900,250',
      '900,1000',
      '1400,500',
    ]);
  });

  it('carries the consumer metadata on nodes, edges and the graph', () => {
    const graph = load();

    expect(graph.getEdgeAttributesFor([[900, 1000], [900, 500]])).toEqual({
      type: 'skeleton',
      key: 'b4#0',
      width: 200,
      label: 'b5',
      weight: 500,
    });
    expect(graph.getNodeLabel([400, 0])).toBe('n2');
    expect(graph.getEdgeLabel([[400, 0], [900, 0]])).toBe('b2');
    expect(graph.getAttributes()).toEqual({ nextNodeLabelIndex: 13, nextEdgeLabelIndex: 12 });
  });

  it('stores the geometric length of the (rounded) segment as the edge weight', () => {
    const graph = load();

    expect(graph.getEdgeWeight([[0, 0], [400, 0]])).toBe(400);
    expect(graph.getEdgeWeight([[400, 600], [700, 900]])).toBeCloseTo(424.264, 3);
    // Missing edge: 0, not null.
    expect(graph.getEdgeWeight([[7, 7], [8, 8]])).toBe(0);
  });

  it('decomposes the graph into paths broken at junctions and stubs, covering each edge once', () => {
    const graph = load();
    const paths = graph.findPaths();

    expect(paths.map((path) => path.map(pointId).join(' > '))).toEqual([
      '0,0 > 400,0',
      '400,0 > 900,0 > 900,250 > 900,500',
      '400,0 > 400,600 > 700,900',
      '900,500 > 900,1000 > 1400,1000 > 1400,500 > 900,500',
      '2000,0 > 2400,0',
    ]);

    const covered = paths.flatMap((path) =>
      path.slice(1).map((point, i) => edgeId([path[i]!, point])),
    );
    expect(covered.sort()).toEqual(graph.getEdges().map(edgeId).sort());
  });

  it('splits the graph into components in discovery order', () => {
    const components = load()
      .getConnectedComponents()
      .map((component) => component.map(pointId));

    expect(components).toEqual([
      ['0,0', '400,0', '900,0', '400,600', '900,250', '700,900', '900,500', '900,1000', '1400,500', '1400,1000'],
      ['2000,0', '2400,0'],
    ]);
  });

  it('orders neighbours by left turn for a walk arriving eastwards', () => {
    expect(load().getNeighborsByLeftTurn([400, 0], [1, 0]).map(pointId)).toEqual([
      '0,0',
      '400,600',
      '900,0',
    ]);
  });

  it('routes by geometric length, and returns an empty route when there is none', () => {
    const graph = load();
    const route = graph.getShortestPath([0, 0], [1400, 1000]);

    expect(route.map((s) => [s.start.x, s.start.y, s.end.x, s.end.y])).toEqual([
      [0, 0, 400, 0],
      [400, 0, 900, 0],
      [900, 0, 900, 250],
      [900, 250, 900, 500],
      [900, 500, 1400, 500],
      [1400, 500, 1400, 1000],
    ]);
    expect(route.reduce((sum, s) => sum + s.length, 0)).toBe(2400);
    // The consumer does not route today; this pins the library's own behavior.
    expect(graph.getShortestPath([0, 0], [2000, 0])).toEqual([]);
  });

  it('answers missing points with neutral values', () => {
    const graph = load();

    expect(graph.getPointDegree([7, 7])).toBe(0);
    expect(graph.getPointNeighbors([7, 7])).toEqual([]);
    expect(graph.getPointAttributes([7, 7])).toEqual({});
    expect(graph.getEdgeAttributesFor([[7, 7], [8, 8]])).toBeNull();
    expect(graph.getEdgeBetweenPoints([0, 0], [900, 0])).toBeNull();
    expect(graph.getNodeLabel([9, 9])).toBeNull();
    expect(graph.getEdgeLabel([[0, 0], [9, 9]])).toBeNull();
  });

  it('rounds lookups to the whole-number grid', () => {
    const graph = load();

    expect(graph.hasPointNode([0.4, 0.4])).toBe(true);
    // Math.round: halves round up.
    expect(graph.hasPointNode([0.5, 0])).toBe(false);
    expect(graph.getEdgeBetweenPoints([0.4, 0.2], [400, 0])).toEqual([[0, 0], [400, 0]]);
  });

  it('finds the nearest node and the projection onto the nearest edge', () => {
    const graph = load();

    expect(pointId(graph.getClosestNodeToPoint([1000, 600]))).toBe('900,500');
    // Equidistant nodes: the earlier one in insertion order wins.
    expect(pointId(graph.getClosestNodeToPoint([650, 0]))).toBe('400,0');
    expect(graph.projectPointOnClosestEdge([650, 80])).toEqual([[650, 0], [[400, 0], [900, 0]]]);
    // Beyond an end: clamped to that end, edge returned as stored.
    expect(graph.projectPointOnClosestEdge([-100, 0])).toEqual([[0, 0], [[0, 0], [400, 0]]]);
  });

  it('throws on an empty graph where the consumer guards with `size > 0`', () => {
    const empty = new SpatialGraph();

    expect(() => empty.getClosestNodeToPoint([1, 1])).toThrow(/no nodes/);
    expect(() => empty.projectPointOnClosestEdge([1, 1])).toThrow(/no edges/);
  });

  it('keeps the graph attributes and class on copy()', () => {
    const copy = load().copy();

    expect(copy).toBeInstanceOf(SpatialGraph);
    expect(copy.getAttribute('nextNodeLabelIndex')).toBe(13);
  });
});

describe('consumer baseline: stored data', () => {
  it('round-trips the consumer format without losing coordinates, widths, labels or counters', () => {
    const graph = load();
    const once = toStored(graph);
    const twice = toStored(loadStored(once));

    expect(twice).toEqual(once);
    expect(once.attributes).toEqual({ nextNodeLabelIndex: 13, nextEdgeLabelIndex: 12 });
    expect(once.nodes.map((node) => node.key).sort()).toEqual(
      stored().nodes!.map((node) => node.key).sort(),
    );
    expect(once.edges.map((edge) => edge.attributes.label)).toEqual(
      stored().edges.map((edge) => edge.attributes.label),
    );
  });

  it('snaps producer coordinates to the whole-number grid, which can break connectivity', () => {
    // Producer data is fractional. Rounding is per endpoint, so two ends of the
    // "same" junction that straddle .5 land on different nodes.
    const graph = loadStored(readFixture('producer-skeleton.json'));

    expect(graph.getNodes().map(pointId)).toEqual(['0,0', '301,0', '300,0', '301,251', '600,0']);
    expect(describeEdges(graph)).toEqual([
      '0,0|301,0 w=140 -',
      '300,0|301,251 w=140 -',
      '301,0|600,0 w=140 -',
    ]);
    // Baseline quirk: the junction at (300.6, 0.2) / (300.4, 0.3) became two nodes,
    // so the vertical edge is disconnected from the horizontal run.
    expect(graph.getConnectedComponents()).toHaveLength(2);
    // Baseline quirk: an edge that rounds to zero length (e3) is silently dropped.
    expect(graph.size).toBe(3);
    // Weight is the length of the rounded segment, not the producer's `length`.
    expect(graph.getEdgeWeight([[0, 0], [301, 0]])).toBe(301);
  });

  it('does not overwrite a producer-supplied key and gives unwidthed edges the default', () => {
    const graph = loadStored(readFixture('producer-skeleton.json'));

    expect(graph.getEdgeAttributesFor([[301, 0], [600, 0]])).toEqual({
      type: 'skeleton',
      key: 'e2',
      width: 140,
      weight: 299,
    });
  });
});

describe('consumer baseline: edit outcomes', () => {
  it('moves a node in place: edges stretch, attributes and ids stay, weights follow', () => {
    const graph = load();
    ensureEditingIds(graph);

    graph.moveNode([400, 600], [450, 650]);

    expect(graph.hasPointNode([400, 600])).toBe(false);
    expect(describeEdges(graph).filter((line) => line.includes('450,650'))).toEqual([
      '400,0|450,650 w=140 b9',
      '450,650|700,900 w=140 b10',
    ]);
    // Orientation is kept: the moved end stays on its side of the pair.
    expect(
      graph
        .getEdges()
        .filter((edge) => edge.map(pointId).join().includes('450,650'))
        .map((edge) => edge.map(pointId).join('>')),
    ).toEqual(['400,0>450,650', '450,650>700,900']);
    const stretched = graph.getEdgeAttributesFor([[400, 0], [450, 650]])!;
    expect(stretched.weight).toBeCloseTo(651.92, 2);
    expect(stretched.key).toBe('b8#0');
    // Baseline quirk: the stored `id` is a stable name, so it no longer matches the geometry.
    expect(stretched.id).toBe('400,0|400,600');
    expect(graph.getPointAttributes([450, 650])).toEqual({ label: 'n9', id: '400,600' });
  });

  it('rounds a fractional move target onto the grid', () => {
    const graph = load();

    graph.moveNode([400, 600], [450.4, 650.6]);

    expect(graph.hasPointNode([450, 651])).toBe(true);
    expect(graph.getNodeLabel([450, 651])).toBe('n9');
  });

  it('merges into an existing node when a move lands on it: the destination attributes win', () => {
    const graph = load();
    ensureEditingIds(graph);

    graph.moveNode([700, 900], [900, 1000]);

    expect([graph.order, graph.size]).toEqual([11, 11]);
    expect(describeEdges(graph).filter((line) => line.includes('900,1000'))).toEqual([
      '1400,1000|900,1000 w=140 b8',
      '400,600|900,1000 w=140 b10',
      '900,1000|900,500 w=200 b5',
    ]);
    // The moved node's label (n10) and id are gone; the destination keeps its own.
    expect(graph.getPointAttributes([900, 1000])).toEqual({ label: 'n6', id: '900,1000' });
  });

  it('collapsePointInto gives the same result as a move onto a node', () => {
    const moved = load();
    const collapsed = load();

    moved.moveNode([700, 900], [900, 1000]);
    collapsed.collapsePointInto([700, 900], [900, 1000]);

    expect(describeEdges(collapsed)).toEqual(describeEdges(moved));
    expect(collapsed.getPointAttributes([900, 1000])).toEqual({ label: 'n6' });
  });

  it('splits an edge: both halves copy every attribute, and a stored id is regenerated', () => {
    const graph = load();
    ensureEditingIds(graph);

    graph.splitEdge([[400, 0], [900, 0]], [650, 0]);

    expect([graph.order, graph.size]).toEqual([13, 12]);
    const halves = [
      graph.getEdgeAttributesFor([[400, 0], [650, 0]]),
      graph.getEdgeAttributesFor([[650, 0], [900, 0]]),
    ];
    expect(halves).toEqual([
      { type: 'skeleton', key: 'b1#0', width: 140, label: 'b2', weight: 250, id: '400,0|650,0' },
      { type: 'skeleton', key: 'b1#0', width: 140, label: 'b2', weight: 250, id: '650,0|900,0' },
    ]);
    // The new node starts with no attributes of its own.
    expect(graph.getPointAttributes([650, 0])).toEqual({});
  });

  it('persists the duplicated key and label of a split, for the consumer to repair', () => {
    const graph = load();
    graph.splitEdge([[400, 0], [900, 0]], [650, 0]);

    const out = toStored(graph);
    // Baseline quirk (audit A5): splitting copies identifying metadata to both halves.
    expect(out.edges.filter((edge) => edge.key === 'b1#0')).toHaveLength(2);
    expect(out.edges.filter((edge) => edge.attributes.label === 'b2')).toHaveLength(2);

    const reloaded = loadStored(out);
    expect(
      reloaded
        .getEdges()
        .filter((edge) => edge.map(pointId).join().includes('650,0'))
        .map((edge) => reloaded.getEdgeLabel(edge)),
    ).toEqual(['b2', 'b2']);
  });

  it('splits at an existing end point without changing anything', () => {
    const graph = load();
    const before = describeEdges(graph);

    graph.splitEdge([[400, 0], [900, 0]], [900, 0]);

    expect(describeEdges(graph)).toEqual(before);
    expect([graph.order, graph.size]).toEqual([12, 11]);
  });

  it('does not check that the split point lies on the edge', () => {
    const graph = load();

    graph.splitEdge([[400, 0], [900, 0]], [650, 300]);

    // Baseline quirk (audit A5): the edge becomes a dog-leg through an off-edge point.
    expect(describeEdges(graph).filter((line) => line.includes('650,300'))).toEqual([
      '400,0|650,300 w=140 b2',
      '650,300|900,0 w=140 b2',
    ]);
  });

  it('splits at a projection between grid points: the new node is the rounded, slightly off-line point', () => {
    // Projections and edge crossings are fractional; nodes are not. The edge from
    // (0,0) to (300,100) passes through (90.9, 30.3), which rounds to (91, 30).
    const graph = new SpatialGraph({ segments: [new Segment(new Point(0, 0), new Point(300, 100))] });

    // The projection helper already returns the rounded point.
    const [projected, edge] = graph.projectPointOnClosestEdge([101, 0]);
    expect(projected).toEqual([91, 30]);

    graph.splitEdge(edge, projected);

    expect(graph.getNodes().map(pointId)).toEqual(['0,0', '300,100', '91,30']);
    // Baseline quirk (audit A2): (91, 30) is about 0.32 off the original line, so the
    // two halves bend slightly. A 2.0 split that validates containment needs a
    // position tolerance of at least half a grid cell's diagonal (about 0.71) for
    // this flow to keep working.
    const offLine = Math.abs(100 * 91 - 300 * 30) / Math.hypot(300, 100);
    expect(offLine).toBeCloseTo(0.316, 3);
  });

  it('branches from the interior of an edge: project, split, then connect', () => {
    const graph = load();

    const [snapped, edge] = graph.projectPointOnClosestEdge([650, 80]);
    graph.splitEdge(edge, snapped);
    graph.addSegment(new Segment(new Point(...snapped), new Point(650, 300)), {
      type: 'skeleton',
      width: 140,
    });

    expect(graph.getPointDegree([650, 0])).toBe(3);
    expect(graph.getEdgeAttributesFor([[650, 0], [650, 300]])).toEqual({
      type: 'skeleton',
      width: 140,
      weight: 300,
    });
  });

  it('joins a collinear pass-through node: the two edges merge, the second neighbour winning', () => {
    const graph = load();

    graph.removeDegree2PointAndJoin([900, 250]);

    expect(graph.hasPointNode([900, 250])).toBe(false);
    // Baseline quirk: which label/key survives follows graphology's neighbour order.
    expect(graph.getEdgeAttributesFor([[900, 0], [900, 500]])).toEqual({
      type: 'skeleton',
      key: 'b3#0',
      width: 140,
      label: 'b4',
      weight: 500,
    });
  });

  it('replaces the joined attributes when the caller supplies them', () => {
    const graph = load();

    graph.removeDegree2PointAndJoin([900, 250], { label: 'b3', width: 150 });

    expect(graph.getEdgeAttributesFor([[900, 0], [900, 500]])).toEqual({
      label: 'b3',
      width: 150,
      weight: 500,
    });
  });

  it('also joins across a bend, replacing two edges with one straight shortcut', () => {
    const graph = load();

    graph.removeDegree2PointAndJoin([400, 600]);

    // Baseline quirk (audit A5): the consumer's "delete vertex" relies on this
    // changing the shape. A safe `joinNode` must not break that flow.
    expect(describeEdges(graph).filter((line) => line.includes('400,0|700,900'))).toEqual([
      '400,0|700,900 w=140 b10',
    ]);
    expect(graph.getPointDegree([400, 0])).toBe(3);
  });

  it('removes only a dead-end node, and ignores any other', () => {
    const graph = load();

    graph.removeStubPoint([0, 0]);
    expect([graph.order, graph.size, graph.hasPointNode([0, 0])]).toEqual([11, 10, false]);

    graph.removeStubPoint([400, 0]);
    expect([graph.order, graph.size]).toEqual([11, 10]);
  });

  it('removes an edge but leaves its end nodes, which the consumer prunes itself', () => {
    const graph = load();

    graph.removeEdge([[2000, 0], [2400, 0]]);

    expect([graph.order, graph.size]).toEqual([12, 10]);
    expect(graph.getPointDegree([2000, 0])).toBe(0);

    graph.removePoint([2000, 0]);
    graph.removePoint([2400, 0]);
    expect([graph.order, graph.size]).toEqual([10, 10]);
  });

  it('moves several nodes at once, rewiring a swap correctly', () => {
    const graph = load();

    graph.moveNodes([
      [[0, 0], [400, 0]],
      [[400, 0], [0, 0]],
    ]);

    expect(graph.getPointDegree([0, 0])).toBe(3);
    expect(graph.getPointDegree([400, 0])).toBe(1);
    expect(graph.getNodeLabel([0, 0])).toBe('n2');
    expect(graph.getNodeLabel([400, 0])).toBe('n1');
  });

  it('treats a chain of moves as simultaneous, whatever the list order', () => {
    const forward = load();
    const reversed = load();

    forward.moveNodes([
      [[2000, 0], [2400, 0]],
      [[2400, 0], [2800, 0]],
    ]);
    reversed.moveNodes([
      [[2400, 0], [2800, 0]],
      [[2000, 0], [2400, 0]],
    ]);

    const tail = (graph: SpatialGraph) =>
      describeEdges(graph).filter((line) => /2000|2400|2800/.test(line));
    expect(tail(forward)).toEqual(['2400,0|2800,0 w=140 b11']);
    expect(tail(reversed)).toEqual(tail(forward));
    // The edge that joined the two moved nodes now joins their new positions.
    expect(forward.hasPointNode([2000, 0])).toBe(false);
  });

  it('throws before changing anything when the node to move does not exist', () => {
    const graph = load();
    const before = describeEdges(graph);

    expect(() => graph.moveNode([5, 5], [6, 6])).toThrow(/does not exist/);
    expect(describeEdges(graph)).toEqual(before);
  });

  it('writes to a missing node by creating it (upsert), and ignores labels on missing members', () => {
    const graph = load();

    graph.mergePointAttributes([123, 456], { label: 'x' });
    expect(graph.hasPointNode([123, 456])).toBe(true);

    graph.setEdgeLabel([[9, 9], [8, 8]], 'zz');
    expect(graph.getEdgeLabel([[9, 9], [8, 8]])).toBeNull();
    expect(graph.hasPointNode([9, 9])).toBe(false);
  });

  it('keeps the existing edge when a segment is added twice', () => {
    const graph = load();

    graph.addSegment(new Segment(new Point(0, 0), new Point(400, 0)), { width: 300 });

    const attrs = graph.getEdgeAttributesFor([[0, 0], [400, 0]]) as EdgeAttributes;
    expect(attrs.width).toBe(140);
    expect(graph.size).toBe(11);
  });
});
