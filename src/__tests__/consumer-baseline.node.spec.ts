import { describe, expect, it } from 'vitest';
import { SpatialGraph } from '../index.js';
import { describeEdges, ensureEditingIds, loadStored, readFixture, toStored } from './fixtures/consumer/adapter.js';
const load = () => loadStored(readFixture('stored-skeleton.json'));
describe('consumer migration acceptance', () => {
  it('restores stored grid coordinates, labels, widths, isolated nodes and counters', () => {
    const graph = load();
    expect([graph.nodeCount, graph.edgeCount]).toEqual([12, 11]);
    expect(graph.getNodeLabel([400, 600])).toBe('n9');
    expect(graph.getEdgeAttributes([[400, 0], [900, 0]])!.width).toBe(140);
    expect(graph.getGraphAttribute('nextNodeLabelIndex')).toBe(13);
    expect(describeEdges(loadStored(toStored(graph)))).toEqual(describeEdges(graph));
  });
  it('preserves the explicit integer policy for producer geometry', () => {
    const graph = loadStored(readFixture('producer-skeleton.json'));
    expect(graph.getNodePoints()).toEqual([[0, 0], [301, 0], [300, 0], [301, 251], [600, 0]]);
    expect(graph.getConnectedComponents()).toHaveLength(2); expect(graph.edgeCount).toBe(3);
    expect(graph.getEdgeLength([[0, 0], [301, 0]])).toBe(301);
  });
  it('keeps editor identities across moves while length follows the geometry', () => {
    const graph = load(); ensureEditingIds(graph);
    graph.moveNode([400, 600], [450.4, 650.6]);
    expect(graph.hasNode([450, 651])).toBe(true); expect(graph.getNodeLabel([450, 651])).toBe('n9');
    expect(graph.getEdgeAttributes([[400, 0], [450, 651]])!.id).toBe('400,0|400,600');
    expect(graph.getEdgeLength([[400, 0], [450, 651]])).toBeCloseTo(Math.hypot(50, 651));
  });
  it('retains stationary destination labels and editor metadata on merges', () => {
    const graph = load(); ensureEditingIds(graph);
    graph.mergeNodeInto([700, 900], [900, 1000]);
    expect([graph.nodeCount, graph.edgeCount]).toEqual([11, 11]);
    expect(graph.getNodeLabel([900, 1000])).toBe('n6'); expect(graph.getNodeAttributes([900, 1000])!.id).toBe('900,1000');
  });
  it('makes split ID policy explicit and rejects accidental dog-leg splits', () => {
    const graph = load(); ensureEditingIds(graph); const before = graph.export();
    expect(() => graph.splitEdge([[400, 0], [900, 0]], [650, 300])).toThrow(/off/); expect(graph.export()).toEqual(before);
    const result = graph.splitEdge([[400, 0], [900, 0]], [650, 0], { splitAttributes: (edge, endpoints) => ({ ...edge.attributes, id: endpoints.map((p) => graph.getNodeKey(p)).join('|') }) });
    expect(result.edges.map((edge) => edge.attributes.id)).toEqual(['400,0|650,0', '650,0|900,0']);
    expect(result.edges.map((edge) => edge.attributes.width)).toEqual([140, 140]);
  });
  it('supports the consumer join rule and explicit bend collapse', () => {
    const graph = load();
    expect(graph.joinNode([900, 250], { joinAttributes: (a, b) => ({ ...(a.length >= b.length ? a : b).attributes, label: 'joined' }) }).changed).toBe(true);
    expect(graph.getEdgeLabel([[900, 0], [900, 500]])).toBe('joined');
    expect(graph.joinNode([400, 600]).reason).toBe('bend');
    expect(graph.collapseDegree2Node([400, 600]).changed).toBe(true);
  });
  it('preserves simultaneous swap/chain edits and neutral missing behavior', () => {
    const graph = load(); graph.moveNodes([[[0, 0], [400, 0]], [[400, 0], [0, 0]]]);
    expect(graph.getNodeDegree([0, 0])).toBe(3); expect(graph.getNodeDegree([400, 0])).toBe(1);
    expect(graph.getNodeLabel([0, 0])).toBe('n2'); expect(graph.getNodeLabel([400, 0])).toBe('n1');
    const before = graph.export(); expect(() => graph.moveNode([99, 99], [100, 100])).toThrow(); expect(graph.export()).toEqual(before);
    expect(graph.getNodeDegree([99, 99])).toBeNull(); expect(graph.mergeNodeAttributes([99, 99], { label: 'missing' })).toBeNull();
  });
  it('supports split-and-connect editing with exact snapping and explicit grid tolerance', () => {
    const graph = load(), nearest = graph.findNearestEdge([650, 80])!;
    expect(nearest.point).toEqual([650, 0]); graph.splitEdge(nearest.edge, nearest.point); graph.addEdge([[650, 0], [650, 300]], { width: 140 });
    expect(graph.getNodeDegree([650, 0])).toBe(3);
    const fractional = new SpatialGraph({ coordinatePrecision: 0, positionTolerance: 0.5 }); fractional.addEdge([[0, 0], [300, 100]]);
    const projection = fractional.findNearestEdge([101, 0])!; expect(projection.point[0]).toBeCloseTo(90.9); expect(fractional.splitEdge(projection.edge, projection.point).node!.point).toEqual([91, 30]);
  });
});
