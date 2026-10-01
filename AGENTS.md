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
pnpm typecheck:demo   # vue-tsc --noEmit on src/demo
pnpm build:demo       # vite build of the demo -> demo-dist/
pnpm demo             # dev server for the demo on localhost
```

Run typecheck, typecheck:demo, test, build, build:demo, check:package and check:examples before opening a PR. CI runs the same.

## Layout

- `src/SpatialGraph.ts`: the `SpatialGraph` class (extends graphology `Graph`).
- `src/utils/`: pure geometry helpers (`geometry`, `intersection`, `projection`).
- `src/types.ts`, `src/constants.ts`: public types and tunables.
- `src/index.ts`: the public surface. Everything exported here is public API.
- `src/__tests__/*.node.spec.ts`: tests next to the code they cover.
- `src/demo/`: the interactive graph editor demo (Vue 3 + SVG), see
  `docs/graph-editor-design.md`. Not part of the package and not public API; the
  root `tsconfig.json` excludes it and `src/demo/tsconfig.json` checks it.
  `src/demo/editor/` is framework-free TypeScript with tests; the `.vue` files only
  translate DOM events and draw. The demo imports the package by name, which Vite
  and Vitest alias to `src/index.ts`.
- `examples/*.ts`: runnable examples that assert their own results. `pnpm test` runs
  them against `src`; `pnpm check:examples` runs them against `dist`. Not published.

## Conventions

- ESM with `.js` extensions on relative imports (`nodenext`).
- Public methods take `NxPoint`/`NxEdge` tuples, not flatten-js objects, unless
  the name says otherwise.
- Node keys are `"x,y"` after rounding to `COORDINATE_PRECISION`. Go through
  `nodeKey`/`getPointKey`; never build keys by hand.
- Query methods return empty values for missing points; throw only when a result
  cannot be produced (empty graph, missing node to move). Error messages must say
  what was wrong and how to fix the call.
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
