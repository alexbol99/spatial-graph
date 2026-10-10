import graphPackage = require('@flatten-js/spatial-graph');
const graph = new graphPackage.SpatialGraph<{ tag?: string }, { width: number }>();
const node: graphPackage.SpatialNode<{ tag?: string }> = graph.addNode([0, 0], { tag: 'x' });
const result = graph.addEdge(
  [
    [0, 0],
    [3, 4],
  ],
  { width: 2 },
);
if (result.edge) {
  const edge: graphPackage.SpatialEdge<{ tag?: string }, { width: number }> = result.edge;
  const width: number = edge.attributes.width;
  void width;
}
const snapshot: graphPackage.SpatialGraphJSON<{ tag?: string }, { width: number }> = graph.export();
void node;
void snapshot;
const imported = graphPackage.SpatialGraph.fromGraphology(graph.toGraphology(), {
  coordinatePrecision: 0,
});
imported.addNode([1, 1]);
imported.addEdge([
  [0, 0],
  [1, 1],
]);
const restored = graphPackage.SpatialGraph.fromJSON(snapshot, { positionTolerance: 1e-9 });
restored.addNode([1, 1]);
const typed = graphPackage.SpatialGraph.fromGraphology<{ tag?: string }, { width: number }>(
  graph.toGraphology(),
  { coordinatePrecision: 0 },
);
const importedWidth: number | undefined = typed.getEdges()[0]?.attributes.width;
void importedWidth;
// @ts-expect-error An explicit custom edge type still requires its metadata.
typed.addEdge([
  [0, 0],
  [1, 1],
]);
const visit: graphPackage.TraversalCallback<{ tag?: string }> = (node, depth) => {
  const tag: string | undefined = node.attributes.tag;
  void tag;
  return depth >= 2;
};
graph.bfs(visit);
graph.dfs(visit);
graph.bfsFromNode(node, visit);
graph.dfsFromNode([0, 0], visit);
// @ts-expect-error Traversal visitors cannot return a Promise.
graph.dfsFromNode(node, async () => {});
graph.getShortestPath([0, 0], [3, 4], { algorithm: graphPackage.PathAlgorithm.Dijkstra });
// @ts-expect-error Algorithm strings must use the exported enum.
graph.getShortestPath([0, 0], [3, 4], { algorithm: 'astar' });
// @ts-expect-error Required edge metadata.
graph.addEdge([
  [0, 0],
  [2, 0],
]);
