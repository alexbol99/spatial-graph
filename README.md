# @flatten-js/spatial-graph

A planar graph for routing, drawings, and line networks. Nodes occupy canonical
`[x, y]` coordinates; edges are straight segments. SpatialGraph owns a private
Graphology graph and mutable RBush indexes. Queries return immutable
`SpatialNode` and `SpatialEdge` snapshots.

## Install

```sh
npm install @flatten-js/spatial-graph @flatten-js/core
```

ESM and CommonJS are supported, with declarations for both. Node.js 22+ is
required. Raw TypeScript examples require Node.js 22.18+. Flatten is a peer
for explicit geometry conversions. Graphology and RBush are internal runtime
dependencies; SpatialGraph does not extend Graphology.

## Usage

```ts
import { SpatialGraph } from '@flatten-js/spatial-graph';

const graph = new SpatialGraph();
graph.addEdge([[0, 0], [10, 0]], {label: 'link'});
graph.addEdge([[10, 0], [10, 10]]);

const node = graph.getNode([10, 0]);
node?.type;                         // 'corner'
const edge = graph.getEdgeBetween([0, 0], [10, 0]);
edge?.midpoint;                     // [5, 0]
edge?.length;                       // 10

if (node) {
  graph.moveNode(node, [12, 0]);
  node.point;                       // retained snapshot: [10, 0]
  graph.getNode([10, 0]);            // null
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

```ts
interface NodeData { name: string }
interface EdgeData { width: number }
const typed = new SpatialGraph<NodeData, EdgeData>({
  createNodeAttributes: () => ({name: ''}),
});
typed.addEdge([[0, 0], [1, 0]], {width: 3});
const width: number = typed.getEdges()[0]!.attributes.width;
```

Required node fields require a factory for implicit endpoints and split nodes;
required edge/node attribute arguments cannot be omitted. Graph metadata has
separate `getGraphAttribute`, `setGraphAttribute`, `getGraphAttributes`, and
`replaceGraphAttributes` methods. Label setters update existing elements only;
`null` removes a label.

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

Complete, asserting versions of these recipes are in [examples/](examples).
They run against source in the test suite and against dist in release validation.

**Route and measure**

```ts
const path = graph.getShortestPath([0, 0], [12, 0], {algorithm: 'astar'});
const length = path?.length; // independent of path.cost
```

Dijkstra is the default. A cost callback returns a finite nonnegative number or
`null` to close an edge; zero is valid. A* defaults to Euclidean distance for
length routing and zero for custom costs. A supplied heuristic must be
admissible, finite, nonnegative, and zero at the destination; the implementation
supports reopening. Missing/disconnected endpoints return `null`. A route from
an existing node to itself has one node and no edges.

`route(fromPoint, toPoint, {maxSnapDistance})` virtually attaches exact nearest
projections and returns traversal `points`, `length`, `cost`, and both snap
results. It uses geometric cost and leaves the graph/revision unchanged.

**Snap and connect**

```ts
const nearest = graph.findNearestEdge([4, 3]);
if (nearest) {
  graph.splitEdge(nearest.edge, nearest.point);
  graph.addEdge([[4, 3], nearest.point]);
}
```

Nearest results contain `edge`, exact `point`, `distance`, parameter `t`, and
`clamped`. The parameter follows the returned edge's source-to-target
orientation. An exactly perpendicular endpoint foot is not clamped. RBush uses
bounding-box lower bounds and exact segment distances, preserving insertion
order for ties. `{scan: true}` selects the reference scan for comparison.
Empty graphs return `null`. Index entries update with every geometry mutation;
metadata edits leave them unchanged.

**Planarize and clean**

```ts
const report = graph.planarize(); // crossings, T-junctions, overlap boundaries
for (const node of graph.getNodesByType('intermediate')) graph.joinNode(node);
```

Planarization is atomic and idempotent for representable intersections. Under a
fixed grid, unrepresentable intersections are reported in `unresolved` without
changing the graph. Overlap pieces use deterministic metadata merging.
`mergeNearbyNodes(tolerance)` forms transitive distance clusters and chooses the
smallest canonical key as representative; its `maxDisplacement` may exceed the
tolerance. Grid quantization and proximity clustering are different operations.

**Save and load**

```ts
const restored = SpatialGraph.fromJSON(JSON.parse(JSON.stringify(graph.export())));
const detached = graph.toGraphology();
const imported = SpatialGraph.fromGraphology(detached);
```

The spatial envelope has schema `spatial-graph`, version `2`, explicit geometry,
options, graph metadata, node records, and keyed edge records. Metadata must be
JSON-compatible for lossless JSON serialization. `import(data)` replaces the
graph after full validation; `{merge: true}` uses the union policy and requires
matching options. `fromLegacyJSON(data, {coordinatePrecision: 0})` explicitly
imports legacy Graphology exports and returns `{graph, report}` with node/edge
collision and collapse counts. Legacy `weight` remains user metadata.

## Interoperability

`toGraphology()` copies adjacency and top-level metadata in O(V+E); nodes have
`x`, `y`, `data`, and edges have derived `length`, `data`. It is detached and
becomes stale after edits. Built-in routing accesses the private graph directly.
`fromGraphology` rejects directed/multi/looped graphs, invalid coordinates, and
normalization collisions. Its optional `mapNodeAttributes`/`mapEdgeAttributes`
callbacks adapt flat metadata; default import expects nested `data`.

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

## API groups

| Task | Methods |
| --- | --- |
| Membership and geometry | `getNode`, `getNodeByKey`, `getNodeKey`, `getEdge`, `getEdgeBetween`, `hasNode`, `hasEdge`, `getNodeType`, `getNodeDegree`, `getEdgeMidpoint`, `getEdgeLength` |
| Collections | `getNodes`, `getEdges`, `getNodePoints`, `getEdgeSegments`, `getNeighbors`, `getNodesByType`, `getJunctions`, `getStubs`, `getConnectedComponents` |
| Metadata | `getNodeAttributes`, `getEdgeAttributes`, `mergeNodeAttributes`, `mergeEdgeAttributes`, node/edge label getters/setters, graph attribute methods |
| Edits | `addNode`, `addEdge`, `addEdges`, `removeNode(s)`, `removeEdge(s)`, `removeStubNode`, `clear`, `moveNode(s)`, `mergeNodeInto`, `splitEdge`, `joinNode`, `collapseDegree2Node`, `union` |
| Algorithms | `findNearestNode`, `findNearestEdge`, `getShortestPath`, `route`, `getPathLength`, `getLongestEdge`, `findPaths`, `findTerminalPaths`, `planarize`, `mergeNearbyNodes`, orthogonality/left-turn queries |
| Copies and adapters | `copy`, `emptyCopy`, `nullCopy`, `getSubgraph`, `export`, `import`, `fromJSON`, `fromLegacyJSON`, Graphology/Flatten/GeoJSON methods, `fromPoints` |

Missing scalar/element queries return `null`, collections `[]`, predicates and
removals `false`. Invalid coordinates, options, off-edge splits and missing move
sources throw actionable errors before mutation. `nodeCount`, `edgeCount`, and
`revision` are read-only properties. Revision counts committed operations.
Label setters respect generic metadata types: required string labels cannot be
removed with `null`, and literal label unions retain their allowed values.

## Migration from 1.x

2.0 is a coordinated breaking change. `NxPoint`/`NxEdge` become
`Point2D`/`Segment2D`. Collection queries return snapshots; use
`getNodePoints`/`getEdgeSegments` for tuples. Replace inherited Graphology calls
with spatial operations or a detached adapter. Set `coordinatePrecision: 0`
when migrating integer-grid consumers. `weight` no longer means geometric length.
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
format, and examples. Do not publish locally.
CI also checks ESM/CJS generic type consumers, Graphology 0.26, and a
Chromium smoke test of the bundled package. Browser testing covers graph edits,
indexed queries, routing, serialization, and Flatten/Graphology conversions;
it is not a cross-browser matrix. Type-consumer fixtures use `skipLibCheck`
because the current upstream interval-tree declarations use extensionless
imports under NodeNext.

## License

MIT. Bundled RBush (MIT) and quickselect (ISC) notices are included in the build.
The package exports no Graphology or geometry-helper internals.
