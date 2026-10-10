import { expect, it } from 'vitest';
import { SpatialGraph } from '../index.js';
it('runs the README/llms usage and property-based element access', () => {
  const graph = new SpatialGraph(); graph.addEdge([[0, 0], [10, 0]], { label: 'link' }); graph.addEdge([[10, 0], [10, 10]]);
  const node = graph.getNode([10, 0])!, edge = graph.getEdgeBetween([0, 0], [10, 0])!;
  expect(node.type).toBe('corner'); expect(edge.midpoint).toEqual([5, 0]); expect(edge.length).toBe(10);
  graph.moveNode(node, [12, 0]); expect(node.point).toEqual([10, 0]); expect(graph.getNode([10, 0])).toBeNull();
});
it('runs every published recipe against source', async () => {
  await import('../../examples/routing.js');
  await import('../../examples/snap-and-connect.js');
  await import('../../examples/planarize.js');
  await import('../../examples/cleanup.js');
  await import('../../examples/proximity-graph.js');
  await import('../../examples/save-and-load.js');
});
