# AGENTS.md

Guidance for AI coding agents working in this repository. For agents *using* the
package in another project, see [llms.txt](llms.txt).

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
- `src/algorithms/`: storage-based traversal, routing, classification and scans.
- `src/adapters/`: Flatten, Graphology, serialization and GeoJSON.
- `src/types.ts`: package-owned public types; tuning policy is per graph.
- `src/index.ts`: the public surface. Everything exported here is public API.
- `src/__tests__/*.node.spec.ts`: tests next to the code they cover.
- `examples/*.ts`: runnable examples that assert their own results. `pnpm test` runs
  them against `src`; `pnpm check:examples` runs them against `dist`. Not published.

## Conventions

- ESM with `.js` extensions on relative imports (`nodenext`).
- Primary methods take `Point2D`/`Segment2D` tuples or `SpatialNode`/`SpatialEdge` snapshots.
  Flatten adapters say `Flatten` in the name; elements never own a graph pointer.
- Node keys derive from graph-local canonical coordinates. Use `getNodeKey` and
  the internal normalizer; never parse keys during algorithms. Exact coordinates
  are the default; `coordinatePrecision: 0` opts into the old integer grid.
- Missing element/scalar queries return `null`; collections return `[]`, membership
  and removal return `false`. Invalid input throws before mutation. All edits
  update private RBush indexes. Snapshots copy/freeze top-level data and coordinates.
  Metadata is nested under `data` internally and never overrides stored geometry.
- Every public method gets a short JSDoc: behavior, return value on the missing
  case, and `@throws` when it throws. The types ship in `dist/*.d.ts`, so JSDoc
  is what consumers and their agents read.
- When public behavior changes, update the JSDoc, `README.md`, `llms.txt` and any
  affected example in the same change, and add a test. The README and `llms.txt`
  recipes are mirrored in `src/__tests__/recipes.node.spec.ts`; change both together.
- Keep the published package small: `files` in `package.json` is `dist`,
  `README.md`, `llms.txt`, `LICENSE`. Do not add `src` or `examples` to it.

## Releasing

See "Releasing" in `README.md`. Releases are tag-driven through GitHub Actions
with npm trusted publishing. Do not publish from a local machine.
