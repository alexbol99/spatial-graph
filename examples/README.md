# Executable examples for SpatialGraph 2.0

These small, independent programs import the public package root, assert their
results, and explain the decisions behind each operation. Each starts with a new
graph; no example needs another example's state. For an installed-package agent,
start with the shipped [llms.txt](../llms.txt) and [README](../README.md). Examples
are source-checkout material and are not included in the npm package.

## Choose by task

Read the first three before editing a graph; choose the rest by the task at hand.

| File | Task and contracts demonstrated |
| --- | --- |
| [snapshots.ts](snapshots.ts) | Node type, edge midpoint/length, same-graph equality/distance, retained snapshots after a move, missing results |
| [metadata.ts](metadata.ts) | Required generic attributes and endpoint factory, explicit updates and label types, weight versus geometry, nested isolation with clone hooks |
| [precision.ts](precision.ts) | Canonical keys, duplicate/collapsed insertion reports, exact projections on an integer grid, atomic rejection of off-edge rounded splits, unresolved crossings |
| [routing.ts](routing.ts) | A* length routing, longer but cheaper custom-cost paths, closed edges, missing endpoints, nonmutating virtual routes and excluded access legs |
| [traversal.ts](traversal.ts) | Graphology BFS/DFS wrappers, snapshot callbacks and depth, all components versus one start, branch pruning and mutation guards |
| [snap-and-connect.ts](snap-and-connect.ts) | Project, split, then connect a spur; missing/endpoint projections and replacement of the old edge |
| [planarize.ts](planarize.ts) | Crossing geometry versus adjacency, all cuts in one edit, idempotence, edge-once path decomposition |
| [cleanup.ts](cleanup.ts) | Explicit component/stub policy, removal counts, safe joins that preserve bends, a closed cycle |
| [proximity-graph.ts](proximity-graph.ts) | Pairwise caller-defined connections, isolated nodes, transitive nearby-node clusters whose displacement exceeds tolerance |
| [save-and-load.ts](save-and-load.ts) | Full spatial JSON persistence, copies, detached Graphology element data and omitted policies/graph metadata, no writeback |
| [geometry-adapters.ts](geometry-adapters.ts) | Explicit Flatten conversion, Cartesian GeoJSON, connected-node metadata loss in line-only export, dimension policy |

Use the assertions as expected outputs. Optional results are checked before
access except where an assertion has already established existence. The examples
show the public API, not internal storage or hand-built coordinate keys.
Thresholds such as stub length, connection radius and largest-component selection
are sample application policies. They are not library defaults.

## Run and validate

Requires Node.js 22.18+ for direct TypeScript execution. Build first: package-name
imports resolve to `dist/` at runtime, and the example TypeScript configuration
also resolves public declarations from `dist/`.

```sh
pnpm install
pnpm build
node examples/snapshots.ts
node examples/routing.ts
pnpm check:examples   # typecheck and execute every examples/*.ts against dist
pnpm test             # execute every example against src through the Vitest alias
```

The source recipe test discovers examples automatically. It also checks every
TypeScript snippet in README.md and llms.txt against a contiguous portion of its
named example, using `<!-- example: filename.ts -->` markers. Documentation cannot
silently diverge from the code checked against source and the built package.
Add a new `.ts` program here and list its task above; both validation paths will
include it. Keep assertions after the matching documentation snippet.

## Scope

These examples cover common workflows and known pitfalls; they do not replace
the full regression/property suite, the ESM/CJS declaration and runtime probes,
or the Chromium package smoke test. Directed graphs, faces, native curved edges,
and custom-cost routing between partial-edge projections are outside the current
API. Migration of the actual consuming application is separate work and may
target the released 2.0 package; it does not gate library publication.
