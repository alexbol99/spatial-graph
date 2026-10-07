# @flatten-js/spatial-graph

[![npm version](https://img.shields.io/npm/v/@flatten-js/spatial-graph)](https://www.npmjs.com/package/@flatten-js/spatial-graph)

A 2D spatial graph on top of [graphology](https://graphology.github.io/) and
[@flatten-js/core](https://github.com/alexbol99/flatten-js). Nodes are points
(`[x, y]` tuples), edges are segments. It is a small toolkit for planar line
networks: build a graph from segments, then route, snap, split, merge and clean
it.

## What is it useful for?

Anything you can describe as points joined by straight segments:

- **Routing and navigation:** shortest paths over road, trail, rail or corridor
  networks, and over waypoint graphs for games and simulations.
- **Snapping and map matching:** find the nearest edge or node to a point and
  project the point onto the network.
- **Vector drawing and CAD clean-up:** split edges at crossings, merge nearby
  nodes, drop dead ends, and join pass-through nodes.
- **Network analysis:** junctions, dead ends, connected components, and chains
  between branch points, for pipes, cables, wiring or circuit traces.
- **Visibility and proximity graphs:** connect points that satisfy your own rule.

## Install

```sh
npm install @flatten-js/spatial-graph @flatten-js/core
```

`@flatten-js/core` is a peer dependency, so your app and this library share one
copy of `Point` and `Segment`.

The package ships both ES modules and CommonJS, with TypeScript declarations for
each. It requires Node.js 22 or later.

## Usage

```ts
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph, type NxEdge, type NxPoint } from '@flatten-js/spatial-graph';

const graph = new SpatialGraph({
  segments: [
    new Segment(new Point(0, 0), new Point(10, 0)),
    new Segment(new Point(10, 0), new Point(10, 10)),
  ],
});

graph.getJunctions();
graph.getShortestPath([0, 0], [10, 10]); // Segment[]
graph.findNearestEdge(new Point(4, 1));
```

## Recipes

Each snippet builds on the `graph` from the usage example above. Complete runnable
versions are in the [`examples/`](examples) folder of the repository.

**Route and measure**

```ts
const route = graph.getShortestPath([0, 0], [10, 10]); // Segment[], [] if unreachable
const length = route.reduce((sum, segment) => sum + segment.length, 0);
```

**Snap a point onto the network and connect it**

```ts
const [snapped, edge] = graph.projectPointOnClosestEdge([4, 3]);
graph.splitEdge(edge, snapped); // the edge now passes through `snapped`
graph.addSegment(new Segment(new Point(4, 3), new Point(...snapped)));
```

**Split two crossing edges at their intersection**

```ts
const [a, b] = graph.getEdges(); // any two edges
if (!a || !b) throw new Error('Need two edges to find a crossing.');

const toSegment = ([start, end]: NxEdge) =>
  new Segment(new Point(...start), new Point(...end));
const [intersection] = toSegment(a).intersect(toSegment(b));
if (intersection instanceof Point) {
  const crossing: NxPoint = [intersection.x, intersection.y];
  graph.splitEdge(a, crossing);
  graph.splitEdge(b, crossing);
}
```

**Clean up a network**

```ts
graph.getStubs().forEach((point) => graph.removeStubPoint(point)); // drop dead ends
graph.removeDegree2PointAndJoin([5, 0]); // merge the two edges meeting at [5, 0]
graph.getConnectedComponents(); // NxPoint[][], one list per separate network
```

Join pass-through nodes one at a time, on nodes you have chosen. Applying
`removeDegree2PointAndJoin` to every degree-2 node would also collapse loops.
See [`examples/cleanup.ts`](examples/cleanup.ts) for a fuller version.

**Connect points by your own rule**

```ts
const proximity = SpatialGraph.createCompleteGraph(
  points,
  (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= maxDistance,
);
```

**Save and load**

The graph serializes with graphology's own JSON format. Load into a new
`SpatialGraph`. `copy()` preserves all nodes and edges, `emptyCopy()` keeps only
nodes, and `nullCopy()` keeps only graph attributes; all three return a
`SpatialGraph` with shallow-copied attributes. Copy options must keep the graph
undirected and simple. The constructor accepts `allowSelfLoops` (default `true`)
for raw graphology calls; point-based segment methods always skip self-loops.
`Graph.from()` returns a plain graphology `Graph`.

```ts
const json = JSON.stringify(graph.export());
const restored = new SpatialGraph();
restored.import(JSON.parse(json));
```

## API overview

`SpatialGraph` extends graphology's `Graph`, so all graphology methods work too.
Main groups of methods:

- **Build:** `addSegment(s)`, `addVertex`, `union`, `splitEdge`, `getSubgraph`, `createCompleteGraph`
- **Query:** `getNodes`, `getEdges`, `getSegments`, `getJunctions`, `getStubs`, `getPointNeighbors`, `getConnectedComponents`
- **Nearest and paths:** `findNearestEdge`, `getClosestNodeToPoint`, `projectPointOnClosestEdge`, `getShortestPath`, `findPaths`, `findIsolatedPaths`
- **Edit:** `moveNode(s)`, `collapsePointInto`, `removeStubPoint`, `removeDegree2PointAndJoin`, `removeEdge(s)`, `removePoint(s)`, `removeSegment`
- **Attributes and labels:** `getPointAttributes`, `mergePointAttributes`, `getEdgeAttributesFor`, `mergeEdgePointAttributes`, `getNodeLabel`, `setNodeLabel`, `getEdgeLabel`, `setEdgeLabel`
- **Orthogonality:** `hasOrthogonalEdges`, `getNodesWithOrthogonalEdges`

The package root exports `SpatialGraph` and its own TypeScript types (`NxPoint`,
`NxEdge`, `NodeAttributes`, `EdgeAttributes`, ...). Geometry operations belong to
`@flatten-js/core`; use its `Point`, `Segment` and other primitives directly.

## Things to know

- **Coordinates are snapped to a grid.** Points are rounded to whole numbers to
  build node keys. Points that round to the same key are the same node, so scale
  your data if it lives on a finer scale. Point-based graph methods return points
  on that same grid.
- **The graph is undirected and simple.** No parallel edges. Point-based segment
  methods skip self-loops: zero-length segments, and segments whose ends round
  to the same node, are skipped without an error. Raw graphology methods allow
  self-loops by default; pass `allowSelfLoops: false` to the constructor to
  disallow them.
- **`weight` is the segment length** and is set for you. Path finding uses it.
- **Queries on a missing point return an empty value** (`[]`, `null`, `{}`, `0`
  or `false`) instead of throwing. The exceptions that throw are
  `findNearestEdge`, `projectPointOnClosestEdge` and `getClosestNodeToPoint` on
  an empty graph, and `moveNode(s)` on a missing node. Their messages say how to
  fix the call.
- **Prefer the point-based methods** (`getPointDegree([x, y])`) over the raw
  graphology ones (`degree('x,y')`). When you need a raw node key, use
  `getPointKey(point)`.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build           # tsdown -> dist/ (ESM + CJS + .d.ts)
pnpm check:package   # publint + are-the-types-wrong
```

Sources are ESM with `.js` extensions on relative imports (`nodenext`).

## Releasing

Releases are published from GitHub Actions with
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no
npm token), and npm generates provenance automatically.

1. Bump `version` in `package.json` and merge to `main`.
2. Tag the release and push the tag. The tag must match the version:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. The `release` workflow (`.github/workflows/publish.yml`) checks the tag,
   runs typecheck, tests, build and package checks, then runs `npm publish`.

## License

MIT
