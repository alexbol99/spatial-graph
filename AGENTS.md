# AGENTS.md

Guidance for AI coding agents working in this repository. For agents *using* the
package in another project, see [llms.txt](llms.txt).
`CLAUDE.md` imports this file; keep contributor instructions here rather than
maintaining a second copy. The current checkout implements the breaking 2.0 API,
with package version `2.0.0`. Check npm/release status when discussing publication.

## What this is

`@flatten-js/spatial-graph`: a 2D graph (nodes are points, edges are segments)
on top of graphology and `@flatten-js/core`. The library is domain-neutral: keep
names, docs and examples generic (networks, routing, drawings), not tied to one
application field.

## Commands

```sh
pnpm install
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (src/**/*.spec.ts)
pnpm build            # tsdown -> dist/ (ESM + CJS + .d.ts)
pnpm check:package    # publint + are-the-types-wrong; run after build
pnpm check:examples   # typecheck and run examples/*.ts against dist; run after build
pnpm check:consumers  # ESM/CJS generic types and runtime; run after build
pnpm check:browser    # Chromium smoke; install with pnpm exec playwright install chromium
```

Run all checks above before opening a PR. CI runs the same on Node 22 and 24.
Do not add benchmark tooling here; performance experiments live in a separate
local repository. Do not enforce fixed timing thresholds in correctness tests.

## Layout

- `src/SpatialGraph.ts`: the composition facade; private Graphology storage is in `src/internal/`.
- `src/utils/`: internal geometry helpers (`geometry`, `projection`).
- `src/SpatialNode.ts` / `src/SpatialEdge.ts`: immutable snapshots.
- `src/algorithms/`: traversal, classification, scans and a `graphology-shortest-path` adapter.
- `src/adapters/`: Flatten, Graphology, serialization and GeoJSON.
- `src/types.ts`: package-owned public types; tuning policy is per graph.
- `src/index.ts`: the public surface. Everything exported here is public API.
- `src/__tests__/*.node.spec.ts`: tests next to the code they cover.
- `examples/*.ts`: runnable examples that assert their own results. `pnpm test` runs
  them against `src`; `pnpm check:examples` runs them against `dist`. Not published.
- `examples/README.md`: task-based reading order and the contracts each example proves.
- `llms.txt` / `README.md`: shipped consumer guidance. `docs/` contains repository-only
  design history and audits; distinguish historical 1.x observations from current behavior.

## Conventions

- Use the Prettier settings in `.prettierrc.json` (2 spaces, 100-column wrapping,
  single quotes and semicolons). Run `pnpm dlx prettier@3.6.2 --write <file>` on
  touched TypeScript files. Separate methods with blank lines, use braces for
  control flow, and keep one statement/declaration per line. Prefer explicit
  branches to nested ternaries when they make an operation easier to read.
- Use `PathAlgorithm.Dijkstra` / `PathAlgorithm.AStar` for routing; do not spell
  algorithm strings in implementation or recipes. Pathfinding delegates to
  `graphology-shortest-path`; the local heap is only for spatial index search.
- Connected components delegate directly to `graphology-components` on private
  storage and return DFS-ordered snapshots. Keep edge-once chain/cycle decomposition
  local: it has a different contract from Graphology simple-path enumeration.
- BFS/DFS methods delegate to `graphology-traversal` on private storage. Visitors
  receive `(SpatialNode, depth)` and run under the callback mutation guard.
  Returning true prunes node expansion, not the entire traversal. Missing starts
  make no visits; avoid exposing direction modes for this undirected graph.
- Constructor and static import metadata schemas are defaulted or supplied
  explicitly. Keep `NoInfer` on their option arguments so coordinate policies
  cannot be inferred as required node attributes. Check ESM and CJS declarations.
- Migration of the actual consumer is separate from library release and may
  target the published 2.0 package. Do not make it a publication gate.
- ESM with `.js` extensions on relative imports (`nodenext`).
- Primary methods take `Point2D`/`Segment2D` tuples or `SpatialNode`/`SpatialEdge` snapshots.
  Flatten adapters say `Flatten` in the name; elements never own a graph pointer.
- Node keys derive from graph-local canonical coordinates. Use `getNodeKey` and
  the internal normalizer; never parse keys during algorithms. Exact coordinates
  are the default; `coordinatePrecision: 0` opts into the old integer grid.
- Missing node/edge geometry and metadata queries return `null`; neighbor queries
  return `[]` and membership returns `false`. Single removals return `false` when
  absent; batch removals return counts. Missing graph attributes return `undefined`.
  Insertions and structural edits have explicit result/report types; inspect them.
  Invalid input throws before mutation. Geometry edits update private RBush indexes;
  metadata edits leave indexes unchanged. Snapshots copy/freeze top-level data and coordinates.
  Metadata is nested under `data` internally and never overrides stored geometry.
- Retained snapshots describe old state. Refetch after geometry/metadata edits;
  snapshot inputs resolve their stored coordinates against current membership.
  Graphology adapters copy topology and element data, omit graph-level metadata
  and spatial policies, and become stale after edits. Use spatial JSON for persistence.
- Every public method gets a short JSDoc: behavior, return value on the missing
  case, and `@throws` when it throws. The types ship in `dist/*.d.ts`, so JSDoc
  is what consumers and their agents read.
- When public behavior changes, update the JSDoc, `README.md`, `llms.txt` and any
  affected example in the same change, and add a test. The README and `llms.txt`
  TypeScript snippets carry `<!-- example: name.ts -->` markers and must match a
  contiguous portion of the named asserting example. `recipes.node.spec.ts` verifies
  this and discovers every `examples/*.ts` automatically; update docs/examples together.
  Keep snippets self-contained and explain missing results, retained snapshots,
  precision limits and application-specific cleanup policies where relevant.
- Keep the published package small: `files` in `package.json` is `dist`,
  `README.md`, `llms.txt`, `LICENSE`. Do not add `src` or `examples` to it.

## Releasing

See [Development and releasing](README.md#development-and-releasing). Releases
are tag-driven through GitHub Actions with npm trusted publishing. Do not publish
from a local machine.
