import { PathAlgorithm, SpatialGraph, SpatialNode, SpatialEdge } from '@flatten-js/spatial-graph';
import type { Point2D, SpatialGraphJSON, TraversalCallback } from '@flatten-js/spatial-graph';
interface NodeData {
  label: string;
}
interface EdgeData {
  width: number;
}
const graph = new SpatialGraph<NodeData, EdgeData>({ createNodeAttributes: () => ({ label: '' }) });
const node: SpatialNode<NodeData> = graph.addNode([0, 0], { label: 'a' });
const result = graph.addEdge(
  [
    [0, 0],
    [1, 0],
  ],
  { width: 2 },
);
if (result.edge) {
  const edge: SpatialEdge<NodeData, EdgeData> = result.edge;
  const width: number = edge.attributes.width;
  const point: Point2D = edge.midpoint;
  void width;
  void point;
}
const data: SpatialGraphJSON<NodeData, EdgeData> = graph.export();
const restored = SpatialGraph.fromJSON<NodeData, EdgeData>(data, {
  createNodeAttributes: () => ({ label: '' }),
});
// Policy dictionaries must not be inferred as required node attributes.
const importedDefaults = SpatialGraph.fromGraphology(graph.toGraphology(), {
  coordinatePrecision: 0,
  positionTolerance: 1e-9,
  straightAngleToleranceDeg: 1e-7,
});
importedDefaults.addNode([2, 0]);
importedDefaults.addEdge([
  [1, 0],
  [2, 0],
]);
const restoredDefaults = SpatialGraph.fromJSON(data, { coordinatePrecision: 0 });
restoredDefaults.addNode([2, 0]);
// Explicit metadata types keep their factory and required-attribute constraints.
const importedTyped = SpatialGraph.fromGraphology<NodeData, EdgeData>(graph.toGraphology(), {
  coordinatePrecision: 0,
  createNodeAttributes: () => ({ label: '' }),
});
const importedWidth: number | undefined = importedTyped.getEdges()[0]?.attributes.width;
void importedWidth;
// @ts-expect-error Required custom node fields still need an endpoint factory.
SpatialGraph.fromGraphology<NodeData, EdgeData>(graph.toGraphology(), { coordinatePrecision: 0 });
// @ts-expect-error Required custom node fields still need an endpoint factory.
SpatialGraph.fromJSON<NodeData, EdgeData>(data);
// @ts-expect-error Explicit edge metadata remains required after import.
importedTyped.addEdge([
  [1, 0],
  [2, 0],
]);
const same: boolean = node.equals(restored.getNode([0, 0])!);
void same;
const visit: TraversalCallback<NodeData> = (node, depth) => {
  const label: string = node.attributes.label;
  void label;
  return depth >= 2;
};
graph.bfs(visit);
graph.dfs(visit);
graph.bfsFromNode(node, visit);
graph.dfsFromNode([0, 0], visit);
// @ts-expect-error Traversal callbacks must be synchronous.
graph.bfs(async () => {});
// @ts-expect-error Traversal supplies a node snapshot, not a coordinate tuple.
graph.dfs((point: Point2D) => {});
graph.getShortestPath([0, 0], [1, 0], { algorithm: PathAlgorithm.AStar });
// @ts-expect-error Use a named algorithm; typos are not valid enum members.
graph.getShortestPath([0, 0], [1, 0], { algorithm: 'astart' });
// @ts-expect-error Required endpoint metadata factory.
new SpatialGraph<NodeData, EdgeData>();
// @ts-expect-error Required edge width.
graph.addEdge([
  [0, 0],
  [1, 1],
]);
// @ts-expect-error Coordinates cannot be mutated through snapshots.
node.point[0] = 10;
graph.setNodeLabel(node, 'updated');
// @ts-expect-error A required label cannot be removed.
graph.setNodeLabel(node, null);
const literal = new SpatialGraph<{ label?: 'a' | 'b' }>();
literal.addNode([0, 0], { label: 'a' });
literal.setNodeLabel([0, 0], 'b');
literal.setNodeLabel([0, 0], null);
// @ts-expect-error Label updates respect the metadata union.
literal.setNodeLabel([0, 0], 'c');
const arbitrary = new SpatialGraph<Record<string, unknown>>();
arbitrary.setNodeLabel([0, 0], 'value');
arbitrary.setNodeLabel([0, 0], null);
const numeric = new SpatialGraph<{ label: number }>({ createNodeAttributes: () => ({ label: 0 }) });
// @ts-expect-error String label helpers cannot overwrite a numeric metadata field.
numeric.setNodeLabel([0, 0], 'value');
