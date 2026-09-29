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

The package ships both ES modules and CommonJS, with TypeScript declarations for
each. It requires Node.js 22 or later.

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

The graph lives on a coordinate grid: points are rounded to
`COORDINATE_PRECISION` decimals (0 by default) to build node keys, so points that
round to the same key are the same node. Helpers that return points
(`fromFlattenPoint`, `findIntersection`, `projectPointOnSegment`, ...) snap
their results to the same grid; checks such as `isPointOnSegment` and the
validation inside `findIntersection` use exact coordinates. `findLineIntersection`
returns the exact intersection of the lines through two edges.

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
