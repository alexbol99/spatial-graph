# @flatten-js/spatial-graph

A 2D graph for routing, drawings, and line networks. Crossings become connected
nodes only when you explicitly split edges or call `planarize()`. Nodes occupy
canonical `[x, y]` coordinates; edges are straight segments. SpatialGraph owns
a private Graphology graph and mutable RBush indexes. Queries return immutable
`SpatialNode` and `SpatialEdge` snapshots.

This guide describes the breaking 2.0 API. Check the installed package version
before applying these recipes to a 1.x project; see the migration section below.

## Agent and documentation entry points

For agents using an **installed package**, start with [llms.txt](llms.txt), then
this README and the shipped `dist/index.d.ts` (ESM) or `dist/index.d.cts` (CJS).
Only the package root is a supported import; `src` and internal helpers are not
published. For repository work, read [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md)
imports that same guidance. Follow the task-based [examples guide](examples/README.md)
for executable contracts and the [agent-readiness audit](docs/agent-readiness-audit.md)
for findings and validation scope. Repository-only links require a source checkout.

## Install

```sh
npm install @flatten-js/spatial-graph @flatten-js/core
```

ESM and CommonJS are supported, with declarations for both. Node.js 22+ is
required. Raw TypeScript examples require Node.js 22.18+. Flatten is a peer
for explicit geometry conversions. Graphology and RBush are internal runtime
dependencies; SpatialGraph does not extend Graphology.

## Usage

<!-- example: snapshots.ts -->

```ts
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Coordinates identify nodes; queries return values captured at the time of query.
const graph = new SpatialGraph();
graph.addEdge(
  [
    [0, 0],
    [10, 0],
  ],
  { label: 'link' },
);
graph.addEdge([
  [10, 0],
  [10, 10],
]);

const node = graph.getNode([10, 0]);
const edge = graph.getEdgeBetween([0, 0], [10, 0]);
if (node && edge) {
  node.type; // 'corner'
  edge.midpoint; // [5, 0]
  edge.length; // 10
  graph.moveNode(node, [12, 0]);
  node.point; // retained snapshot: [10, 0]
  graph.getNode([10, 0]); // null
  graph.getNode([12, 0]); // fetch the current snapshot
}
```

`Point2D` and `Segment2D` describe geometry. `NodeInput` and `EdgeInput` also
accept snapshots: the graph resolves their coordinates against current
membership. Snapshots have no graph reference; old `.type`, `.degree`, and
attributes remain readable after edits. Fetch again for current state.

## Coordinates and identity

Exact finite coordinates are the default. Configure `coordinatePrecision: 0`
to preserve the 1.x integer grid, or an integer from 0 to 15 for decimal
quantization. Quantization uses JavaScript `Math.round` (ties toward positive
infinity), normalizes negative zero, and rejects scaled coordinates outside the
safe integer range. It is a graph-local policy, preserved by copies and imports.

One canonical position identifies one node within a graph. `node.equals(other)`
compares canonical keys; `node.distanceTo(other)` measures Euclidean distance.
Removing and recreating at the same position compares equal. Cross-graph
comparisons are outside this contract. A move removes/recreates the node or
merges it into an occupied destination; old snapshots do not follow the move.
Edge equality compares undirected endpoint positions, independent of storage key.

`positionTolerance` defaults to `1e-9` graph units and controls geometric
containment. `straightAngleToleranceDeg` defaults to `1e-7` degrees. They do not
change equality. Classification is `isolated` (degree 0), `stub` (1),
`intermediate` (straight degree 2), `corner` (bent degree 2), or `junction` (3+).
Geometry is Cartesian, including when importing GeoJSON.

## Metadata and snapshots

Geometry belongs to the library. User fields such as `x`, `type`, `id`, `length`
and `weight` remain ordinary metadata: they cannot override geometry or routing.
Coordinate tuples, snapshots, and attribute dictionaries are frozen at runtime.
Attributes are shallow copies; nested values remain shared by default. Configure
`cloneNodeAttributes`/`cloneEdgeAttributes` for nested isolation. Hooks must return
object dictionaries. Mutation from operation callbacks throws.

<!-- example: metadata.ts -->

```ts
import { SpatialGraph } from '@flatten-js/spatial-graph';

interface NodeData {
  name: string;
}
interface EdgeData {
  width: number;
  weight?: number;
  label?: 'main' | 'secondary';
}

// Edges and splits create nodes implicitly, so required node fields need a factory.
const graph = new SpatialGraph<NodeData, EdgeData>({
  createNodeAttributes: () => ({ name: '' }),
});
const inserted = graph.addEdge(
  [
    [0, 0],
    [10, 0],
  ],
  { width: 3, weight: 999 },
);
if (inserted.status !== 'collapsed') {
  const width: number = inserted.edge.attributes.width;
  graph.mergeEdgeAttributes(inserted.edge, { width: width + 1 });
  graph.setEdgeLabel(inserted.edge, 'main');
}
```

Required node fields require a factory for implicit endpoints and split nodes;
required edge/node attribute arguments cannot be omitted. Graph metadata has
separate `getGraphAttribute`, `setGraphAttribute`, `getGraphAttributes`, and
`replaceGraphAttributes` methods. Label setters update existing elements only;
`null` removes an optional label; generic required labels cannot be removed.

## Edits and conflict policy

`addNode` upserts metadata, with supplied values winning. `addEdge` reports
`added`, `existing`, or `collapsed`; duplicate insertions keep existing metadata,
and collapsed inputs create no nodes. `addEdges` accepts records with
`endpoints` and `attributes`, validates the whole batch, and reports each input
in order, plus counts.

Moves are simultaneous, including swaps and chains. Invalid sources or
conflicting targets for one source reject the entire operation. For merges,
stationary destination metadata wins; otherwise the smallest canonical source
key wins conflicting fields. Edge conflicts use canonical original endpoint
pairs. Nonconflicting metadata is combined. `moveNodes`, `mergeNodeInto`, and
`union` accept custom conflict callbacks and report merged/collapsed elements.
Callbacks receive copied top-level dictionaries during planning.

`splitEdge` validates both the proposed point and its canonical insertion
position against the segment before deleting anything. Endpoint and missing
splits are reported no-ops. Metadata is copied to both pieces; IDs are never
rewritten automatically. Use `splitAttributes` for application identity rules.
Existing replacement edges win conflicts by default.

`joinNode` requires a straight degree-2 node and no existing edge between its
neighbors. It reports why a join is skipped. `collapseDegree2Node` explicitly
allows changing a bend or collapsing a triangle. `joinAttributes` customizes
metadata reconciliation; the default preserves the smallest original endpoint
pair's conflicting fields. These operations report the resulting edge.

## Recipes

Each snippet below creates its own graph and is checked against a matching
[asserting example](examples/README.md). Examples run against source in the test
suite and against `dist` in release validation. Assertions following each snippet
in the example record the expected result.

**Route and measure**

<!-- example: routing.ts -->

```ts
import { PathAlgorithm, SpatialGraph } from '@flatten-js/spatial-graph';

// Two alternatives: a short direct edge and a longer, cheaper detour.
const graph = new SpatialGraph();
graph.addEdges([
  {
    endpoints: [
      [0, 0],
      [20, 0],
    ],
    attributes: { fare: 10 },
  },
  {
    endpoints: [
      [0, 0],
      [0, 10],
    ],
    attributes: { fare: 1 },
  },
  {
    endpoints: [
      [0, 10],
      [20, 10],
    ],
    attributes: { fare: 1 },
  },
  {
    endpoints: [
      [20, 10],
      [20, 0],
    ],
    attributes: { fare: 1 },
  },
]);
const path = graph.getShortestPath([0, 0], [20, 0], { algorithm: PathAlgorithm.AStar });
const length = path?.length; // 20; missing/disconnected endpoints yield null.
```

`PathAlgorithm.Dijkstra` is the default; select A* with `PathAlgorithm.AStar`.
Both delegate to `graphology-shortest-path` through a spatial result adapter. A cost callback returns a finite nonnegative number or
`null` to close an edge; zero is valid. A* defaults to Euclidean distance for
length routing and zero for custom costs. A supplied heuristic must be
admissible, finite, nonnegative, and zero at the destination; the implementation
supports reopening. Closed edges are removed from a temporary Graphology copy
because upstream weight getters coerce `null` to a default weight; routes without
closed edges use the private graph directly. Missing/disconnected endpoints return `null`. A route from
an existing node to itself has one node and no edges.

`route(fromPoint, toPoint, {maxSnapDistance})` virtually attaches exact nearest
projections and returns traversal `points`, `length`, `cost`, and both snap
results. It uses geometric cost and leaves the graph/revision unchanged. Its
length is the network distance between projections; add `from.distance` and `to.distance`
yourself if your application includes the access legs. Virtual routing uses a
temporary Graphology copy with projection nodes, adding O(V+E) time and space
per query before the search.

**Snap and connect**

<!-- example: snap-and-connect.ts -->

```ts
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Split first to make the projection a connected graph node, then add the spur.
const graph = new SpatialGraph();
graph.addEdge([
  [0, 0],
  [20, 0],
]);
const site = [4, 3] as const;
const nearest = graph.findNearestEdge(site);
if (nearest) {
  graph.splitEdge(nearest.edge, nearest.point);
  graph.addEdge([site, nearest.point]);
}
```

Nearest results contain `edge`, exact `point`, `distance`, parameter `t`, and
`clamped`. The parameter follows the returned edge's source-to-target
orientation. An exactly perpendicular endpoint foot is not clamped. RBush uses
bounding-box lower bounds and exact segment distances, preserving insertion
order for ties. `{scan: true}` selects the reference scan for comparison.
Empty graphs return `null`. The example uses exact coordinates: on a quantized
graph, a projection may round off its segment and `splitEdge` will throw before
mutation. See [precision.ts](examples/precision.ts). Index entries update with
every geometry mutation; metadata edits leave them unchanged.

**Planarize crossings**

<!-- example: planarize.ts -->

```ts
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Geometric crossings alone do not create adjacency. Planarize splits ALL cuts.
const graph = new SpatialGraph();
graph.addEdges([
  {
    endpoints: [
      [0, 0],
      [10, 10],
    ],
    attributes: {},
  },
  {
    endpoints: [
      [0, 10],
      [10, 0],
    ],
    attributes: {},
  },
  {
    endpoints: [
      [0, 2],
      [10, 2],
    ],
    attributes: {},
  },
]);
const disconnected = graph.getShortestPath([0, 0], [0, 2]); // null
const report = graph.planarize();
```

Planarization is atomic and idempotent for representable intersections. Under a
fixed grid, unrepresentable intersections are reported in `unresolved` without
changing the graph. Overlap pieces use deterministic metadata merging.
Candidate searches include `positionTolerance`: an endpoint within that distance
of another edge may be used as their shared junction.
`mergeNearbyNodes(tolerance)` forms transitive distance clusters and chooses the
smallest canonical key as representative; its `maxDisplacement` may exceed the
tolerance. Grid quantization and proximity clustering are different operations.

**Save and load**

<!-- example: save-and-load.ts -->

```ts
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Spatial JSON is the persistence format: geometry, keys, policies, and metadata.
const graph = new SpatialGraph({ coordinatePrecision: 0 });
graph.addEdge(
  [
    [0, 0],
    [10, 0],
  ],
  { name: 'first' },
);
graph.addEdge(
  [
    [10, 0],
    [10, 10],
  ],
  { name: 'second' },
);
graph.setNodeLabel([0, 0], 'origin');
graph.setGraphAttribute('name', 'network');
const restored = SpatialGraph.fromJSON(JSON.parse(JSON.stringify(graph.export())));
```

The spatial envelope has schema `spatial-graph`, version `2`, explicit geometry,
options, graph metadata, node records, and keyed edge records. Metadata must be
JSON-compatible for lossless JSON serialization. Factories and clone hooks are
not serialized; supply them again when restoring a typed graph. `import(data)` replaces the
graph after full validation; `{merge: true}` uses the union policy and requires
matching options. `fromLegacyJSON(data, {coordinatePrecision: 0})` explicitly
imports legacy Graphology exports and returns `{graph, report}` with node/edge
collision and collapse counts. Legacy `weight` remains user metadata.

## Interoperability

`toGraphology()` copies adjacency and element metadata in O(V+E); nodes have
`x`, `y`, `data`, and edges have derived `length`, `data`. It is detached and
becomes stale after edits. Nested metadata remains shared unless clone hooks
isolate it. It currently omits graph-level metadata and does not carry spatial
policies or factories. Pass policies to `fromGraphology` and copy graph metadata
explicitly if needed; use spatial JSON for full persistence. Built-in routing
accesses the private graph directly, so it requires no export.
`fromGraphology` rejects directed/multi/looped graphs, invalid coordinates, and
normalization collisions. Its optional `mapNodeAttributes`/`mapEdgeAttributes`
callbacks adapt flat metadata; default import expects nested `data`.

`fromGraphology` and `fromJSON` default to `NodeAttributes`/`EdgeAttributes`;
policy options do not become metadata types. Supply explicit generics for custom
metadata schemas, as with the constructor. Required node fields still require
an endpoint factory. The [save-and-load example](examples/save-and-load.ts)
imports with policy options without explicit default generics.

`addFlattenSegment`, `addFlattenSegments`, `removeFlattenSegment`,
`getFlattenPoints`, and `getFlattenSegments` are explicit adapters. Straight
Multilines expand into segments; arcs, rays and lines are rejected before batch
insertion. Snapshots expose `toFlattenPoint`/`toFlattenSegment` conversions.

`fromGeoJSON` imports Point, LineString and MultiLineString features. Properties
become user metadata; extra dimensions throw unless `dropExtraDimensions` is
explicit. `toGeoJSON` exports one feature per edge and isolated Points. It
preserves edge metadata; metadata on connected nodes is preserved in spatial
JSON, not represented in line-only GeoJSON exports.
Supply `onReport` to receive the insertion report, including segments collapsed
by the selected coordinate precision.

## Traversal

`bfs(callback)` and `dfs(callback)` visit the whole graph, including isolated
nodes. `bfsFromNode(node, callback)` and `dfsFromNode(node, callback)` visit only
nodes reached from a tuple or snapshot; a missing start makes no visits. All
four return `void` and delegate to `graphology-traversal` on private adjacency.

Visitors receive `(SpatialNode, depth)`, with metadata on `node.attributes`.
BFS depth counts hops through the explored graph; DFS depth is discovery depth,
not minimum distance. Each traversal root starts at depth zero. Returning `true`
skips expansion of the current node; it does not cancel the traversal or visits
already queued. Whole-graph traversal may later start a new root among nodes
left unseen by pruning. Visitors must be synchronous and cannot mutate the graph
or start nested traversals. Ordinary reads such as `getNode()` are allowed.
Direction-mode options are omitted because SpatialGraph is undirected.

<!-- example: traversal.ts -->

```ts
import { SpatialGraph } from '@flatten-js/spatial-graph';
import type { Point2D } from '@flatten-js/spatial-graph';

const graph = new SpatialGraph();
graph.addEdge([
  [0, 0],
  [1, 0],
]);
graph.addEdge([
  [0, 0],
  [0, 1],
]);
graph.addEdge([
  [1, 0],
  [2, 0],
]);
graph.addNode([99, 99]); // Isolated nodes are included by whole-graph traversals.

const breadth: Array<[Point2D, number]> = [];
graph.bfsFromNode([0, 0], (node, depth) => {
  breadth.push([node.point, depth]);
  return depth >= 1; // Skip expansion here; other queued nodes are still visited.
});
const depthFirst: Point2D[] = [];
graph.dfsFromNode(graph.getNode([0, 0])!, (node) => {
  depthFirst.push(node.point);
});
let breadthCount = 0;
let depthCount = 0;
graph.bfs(() => {
  breadthCount++;
});
graph.dfs(() => {
  depthCount++;
});
```

## API groups

`getConnectedComponents()` calls `graphology-components` directly on private
adjacency. It returns snapshot groups in Graphology's DFS discovery order,
includes isolated nodes, and returns `[]` for an empty graph. Node order within
a component differs from the previous BFS traversal; do not use it as a route.

| Task | Methods |
| --- | --- |
| Membership and geometry | `getNode`, `getNodeByKey`, `getNodeKey`, `getEdge`, `getEdgeBetween`, `hasNode`, `hasEdge`, `getNodeType`, `getNodeDegree`, `getEdgeMidpoint`, `getEdgeLength` |
| Collections | `getNodes`, `getEdges`, `getNodePoints`, `getEdgeSegments`, `getNeighbors`, `getNodesByType`, `getJunctions`, `getStubs`, `getConnectedComponents` |
| Metadata | `getNodeAttributes`, `getEdgeAttributes`, `mergeNodeAttributes`, `mergeEdgeAttributes`, node/edge label getters/setters, graph attribute methods |
| Edits | `addNode`, `addEdge`, `addEdges`, `removeNode(s)`, `removeEdge(s)`, `removeStubNode`, `clear`, `moveNode(s)`, `mergeNodeInto`, `splitEdge`, `joinNode`, `collapseDegree2Node`, `union` |
| Traversal | `bfs`, `bfsFromNode`, `dfs`, `dfsFromNode` |
| Algorithms | `findNearestNode`, `findNearestEdge`, `getShortestPath`, `route`, `getPathLength`, `getLongestEdge`, `findPaths`, `findTerminalPaths`, `planarize`, `mergeNearbyNodes`, orthogonality/left-turn queries |
| Copies and adapters | `copy`, `emptyCopy`, `nullCopy`, `getSubgraph`, `export`, `import`, `fromJSON`, `fromLegacyJSON`, Graphology/Flatten/GeoJSON methods, `fromPoints` |

Missing node/edge geometry and metadata queries return `null`; neighbor queries
return `[]` and membership predicates return `false`. Single removals return
`false` when absent; batch removals return a count, including `0`. Missing graph
attributes return `undefined`. Edit methods such as split/join/move return reports,
not elements; `addEdge` returns a discriminated insertion result. Invalid
coordinates, options, off-edge splits and missing move sources throw actionable errors before mutation. `nodeCount`, `edgeCount`, and
`revision` are read-only properties. Revision counts committed operations.
Label setters respect generic metadata types: required string labels cannot be
removed with `null`, and literal label unions retain their allowed values.

## Migration from 1.x

2.0 is a coordinated breaking change. `NxPoint`/`NxEdge` become
`Point2D`/`Segment2D`. Collection queries return snapshots; use
`getNodePoints`/`getEdgeSegments` for tuples. Replace inherited Graphology calls
with spatial operations or a detached adapter. Set `coordinatePrecision: 0`
when migrating integer-grid consumers. Routing options use the exported
`PathAlgorithm` enum rather than string literals. `weight` no longer means geometric length.
Connected-component node order now follows Graphology DFS rather than BFS;
consumers assigning labels from traversal order may number nodes differently.
The detailed migration table is in [the refactoring audit](docs/library-refactoring-audit.md#72-naming-and-migration-table).

## Development and releasing

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check:package
pnpm check:examples
pnpm check:consumers
pnpm exec playwright install chromium
pnpm check:browser
```

Releases are tag-driven through GitHub Actions and npm trusted publishing.
Update the package version, commit it, then push a matching `vX.Y.Z` tag when
ready to release. The release workflow validates types, tests, build, package
format, examples, ESM/CJS consumers, and the Chromium smoke test. Do not publish
locally.
CI also checks ESM/CJS generic type consumers, Graphology 0.26, and a
Chromium smoke test of the bundled package. Browser testing covers graph edits,
indexed queries, routing, serialization, and Flatten/Graphology conversions;
it is not a cross-browser matrix. Type-consumer fixtures use `skipLibCheck`
because the current upstream interval-tree declarations use extensionless
imports under NodeNext.

## License

MIT. Bundled RBush (MIT) and quickselect (ISC) notices are included in the build.
The package exports no Graphology or geometry-helper internals.
