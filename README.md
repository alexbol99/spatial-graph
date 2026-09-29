# @flatten-js/spatial-graph

A 2D spatial graph on top of [graphology](https://graphology.github.io/) and
[@flatten-js/core](https://github.com/alexbol99/flatten-js). Nodes are points
(`[x, y]` tuples), edges are segments. It is useful for circulation and
corridor networks, floor-plan analysis and other planar line networks.

## Install

```sh
npm install @flatten-js/spatial-graph @flatten-js/core
```

`@flatten-js/core` is a peer dependency, so your app and this library share one
copy of `Point` and `Segment`.

## Usage

```ts
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '@flatten-js/spatial-graph';

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

## API overview

`SpatialGraph` extends graphology's `Graph`. Main groups of methods:

- **Build:** `addSegment(s)`, `addVertex`, `union`, `splitEdge`, `getSubgraph`
- **Query:** `getNodes`, `getEdges`, `getSegments`, `getJunctions`, `getStubs`, `getPointNeighbors`
- **Nearest and paths:** `findNearestEdge`, `getClosestNodeToPoint`, `projectPointOnClosestEdge`, `getShortestPath`, `findPaths`, `findIsolatedPaths`
- **Edit:** `moveNode(s)`, `collapsePointInto`, `removeStubPoint`, `removeEdge(s)`, `removePoint(s)`, `removeSegment`
- **Orthogonality:** `hasOrthogonalEdges`, `getNodesWithOrthogonalEdges`

Geometry helpers (`pointsEqual`, `getPointDistance`, `findIntersection`,
`nearestPointOnSegment`, `projectPointOnSegment`, ...) and the types (`NxPoint`,
`NxEdge`, `NodeAttributes`, `EdgeAttributes`, ...) are exported from the package root.

Coordinates are rounded to `COORDINATE_PRECISION` (0 decimals by default) when
building node keys.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build      # tsc -> dist/
```

Sources are ESM with `.js` extensions on relative imports (`nodenext`).

## Publishing

```sh
npm login
npm pack --dry-run   # inspect the tarball first
npm publish          # runs typecheck, tests and build first (prepublishOnly)
```

## License

MIT
