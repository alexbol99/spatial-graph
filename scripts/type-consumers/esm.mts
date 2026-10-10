import { SpatialGraph, SpatialNode, SpatialEdge } from '@flatten-js/spatial-graph';
import type { Point2D, SpatialGraphJSON } from '@flatten-js/spatial-graph';
interface NodeData { label: string }
interface EdgeData { width: number }
const graph = new SpatialGraph<NodeData, EdgeData>({ createNodeAttributes: () => ({ label: '' }) });
const node: SpatialNode<NodeData> = graph.addNode([0, 0], { label: 'a' });
const result = graph.addEdge([[0, 0], [1, 0]], { width: 2 });
if (result.edge) {
  const edge: SpatialEdge<NodeData, EdgeData> = result.edge;
  const width: number = edge.attributes.width;
  const point: Point2D = edge.midpoint;
  void width; void point;
}
const data: SpatialGraphJSON<NodeData, EdgeData> = graph.export();
const restored = SpatialGraph.fromJSON<NodeData, EdgeData>(data, { createNodeAttributes: () => ({ label: '' }) });
const same: boolean = node.equals(restored.getNode([0, 0])!); void same;
// @ts-expect-error Required endpoint metadata factory.
new SpatialGraph<NodeData, EdgeData>();
// @ts-expect-error Required edge width.
graph.addEdge([[0, 0], [1, 1]]);
// @ts-expect-error Coordinates cannot be mutated through snapshots.
node.point[0] = 10;
graph.setNodeLabel(node, 'updated');
// @ts-expect-error A required label cannot be removed.
graph.setNodeLabel(node, null);
const literal = new SpatialGraph<{ label?: 'a' | 'b' }>();
literal.addNode([0, 0], { label: 'a' }); literal.setNodeLabel([0, 0], 'b'); literal.setNodeLabel([0, 0], null);
// @ts-expect-error Label updates respect the metadata union.
literal.setNodeLabel([0, 0], 'c');
const arbitrary = new SpatialGraph<Record<string, unknown>>();
arbitrary.setNodeLabel([0, 0], 'value'); arbitrary.setNodeLabel([0, 0], null);
const numeric = new SpatialGraph<{ label: number }>({ createNodeAttributes: () => ({ label: 0 }) });
// @ts-expect-error String label helpers cannot overwrite a numeric metadata field.
numeric.setNodeLabel([0, 0], 'value');
