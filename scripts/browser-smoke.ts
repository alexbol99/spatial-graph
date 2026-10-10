import { PathAlgorithm, SpatialGraph, SpatialNode, SpatialEdge } from '../dist/index.js';

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

try {
  const graph = new SpatialGraph();
  const { edge } = graph.addEdge(
    [
      [0, 0],
      [10, 0],
    ],
    { width: 2 },
  );
  assert(
    edge instanceof SpatialEdge && edge.source instanceof SpatialNode,
    'Snapshot constructors',
  );
  assert(graph.splitEdge(edge, [5, 0]).changed, 'Split');
  graph.moveNode([5, 0], [5, 1]);
  const components = graph.getConnectedComponents();
  assert(
    components.length === 1 &&
      components[0]?.length === 3 &&
      components[0].every((node) => node instanceof SpatialNode),
    'Connected-component snapshots',
  );
  assert(graph.findNearestNode([5, 1])?.key === '5,1', 'Indexed nearest node');
  const counts = [0, 0, 0, 0];
  graph.bfs(() => {
    counts[0]!++;
  });
  graph.dfs(() => {
    counts[1]!++;
  });
  graph.bfsFromNode([0, 0], () => {
    counts[2]!++;
  });
  graph.dfsFromNode([0, 0], () => {
    counts[3]!++;
  });
  assert(
    counts.every((count) => count === 3),
    'BFS/DFS traversal wrappers',
  );
  assert(graph.findNearestEdge([5, 1])?.distance === 0, 'Indexed projection');
  assert(
    graph.getShortestPath([0, 0], [10, 0], { algorithm: PathAlgorithm.AStar })?.edges.length === 2,
    'A*',
  );
  assert(graph.route([1, 0], [9, 0])?.length, 'Virtual route');
  assert(SpatialGraph.fromJSON(graph.export()).edgeCount === 2, 'JSON');
  assert(SpatialGraph.fromGraphology(graph.toGraphology()).edgeCount === 2, 'Graphology');
  assert(graph.getFlattenSegments().length === 2, 'Flatten');
  document.body.textContent = 'passed';
} catch (error) {
  document.body.textContent = `failed: ${String(error)}`;
}
