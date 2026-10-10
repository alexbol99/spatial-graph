import graphPackage = require('@flatten-js/spatial-graph');
const graph = new graphPackage.SpatialGraph<{ tag?: string }, { width: number }>();
const node: graphPackage.SpatialNode<{ tag?: string }> = graph.addNode([0, 0], { tag: 'x' });
const result = graph.addEdge([[0, 0], [3, 4]], { width: 2 });
if (result.edge) {
  const edge: graphPackage.SpatialEdge<{ tag?: string }, { width: number }> = result.edge;
  const width: number = edge.attributes.width; void width;
}
const snapshot: graphPackage.SpatialGraphJSON<{ tag?: string }, { width: number }> = graph.export();
void node; void snapshot;
// @ts-expect-error Required edge metadata.
graph.addEdge([[0, 0], [2, 0]]);
