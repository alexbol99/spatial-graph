# Examples and agent-readiness audit

Audited on 2026-10-10 against the 2.0 implementation on
`codex/spatial-graph-redesign`, starting from commit `7441d12`. This is an additional
audit of the documentation and executable learning path, not another architecture
proposal. The earlier [refactoring audit](library-refactoring-audit.md) records
the architecture and historical 1.x findings.

## 1. Conclusion and scope

The guidance already reflected the major redesign: composition rather than
Graphology inheritance, immutable graph-free snapshots, canonical coordinates,
RBush, and explicit adapters. The weak points were incomplete return contracts,
examples compressed enough to hide important choices, recipes depending on prior
snippet state, and no automatic protection against documentation drift.

Those issues are addressed. Eleven independent asserting examples
now cover core usage and common failure cases. Every TypeScript snippet in the
README and `llms.txt` identifies its executable source, and the recipe suite
checks their agreement. Contributor instructions stay in one place: `CLAUDE.md`
continues importing `AGENTS.md`.

This audit compares documents with the actual source, exported types, package
allowlist, example configuration, tests, and CI/release commands. It does not
measure model comprehension or claim that all agents discover `llms.txt`
automatically. The evidence is executable contracts and an explicit reading path.
The actual consuming application is outside this checkout. Its migration is
separate work that may target the released 2.0 package; it is not a library
release gate, as decided by the owner.

## 2. Findings and changes

| Finding | Consequence for a consumer or agent | Resolution |
| --- | --- | --- |
| Missing values described as uniformly `null`/`false` | Incorrect branches for batch removals and graph attributes | Distinguish single boolean removals, batch counts, `undefined` graph attributes, and edit reports |
| `addEdge` result easy to mistake for an edge | Access to `.length`/`.attributes` on a report, or dereference of a collapsed input | Typed metadata and precision examples discriminate `status`; guidance lists exact result shapes |
| `llms.txt` recipes reused the introduction's mutated graph | Copy/paste order affected whether nodes existed and paths were found | Each snippet imports the public API and constructs its own graph |
| Six examples had very compressed setup/assertions | Correct programs gave little explanation of snapshot lifetime, policy, or failure cases | Expand six existing examples and add snapshots, metadata, precision, and geometry-adapter examples |
| Source recipe test manually listed six example imports | A new example could pass build checks without joining the source suite | Discover every root `examples/*.ts` automatically |
| README/llms “mirrored” recipe test only exercised a separate introductory copy | Documentation could drift independently of the executable examples | Check all marked TypeScript snippets against contiguous code in their named examples |
| Exact projections and grid insertion restrictions were not connected in the snap recipe | Agent might assume all nearest projections can be split on any policy | Explain canonical containment and demonstrate atomic rejection plus an exact-policy alternative |
| Virtual route length omitted access-leg semantics | Application might count network distance as total travel distance | Assert projection-to-projection length, expose snap distances, and document excluded legs |
| Graphology copying described too broadly | Consumers could use an adapter as lossless persistence | Document detached topology/element data, omitted graph metadata/policies, nested sharing, and explicit policy restoration |
| Repository-only examples/audits presented as available alongside installed docs | Agent working in `node_modules` could search paths that are not shipped | Separate installed-package and contributor reading paths |
| “2.0” heading could be read as proof of a published release | An agent might apply 2.0 recipes to an installed 1.x package | State prepared checkout version and require checking the installed version |
| Largest-component/stub cleanup choices were unexplained | Sample thresholds could become assumed library behavior | Label thresholds and one-pass pruning as application policy; safe join preserves bends |
| Quantization described as requiring integer scaled values | Decimal coordinates could be wrongly rejected by a generated wrapper | Describe the magnitude bound before rounding, matching the normalizer |
| `fromGraphology(detached, {coordinatePrecision: 0})` type inference treated the options as required node metadata | Runtime-valid code failed declaration checking with an unexpected factory requirement | Fixed in both `fromGraphology` and `fromJSON`: `NoInfer` on metadata parameters in options preserves defaults and explicit custom schemas; ESM/CJS declaration regressions cover policy-only calls and required fields |

No public implementation behavior or dependency was changed by the documentation
audit itself. A subsequent routing change delegates searches to
`graphology-shortest-path` and exposes `PathAlgorithm.Dijkstra` / `.AStar`;
README/llms examples and package probes now use those named members. Closed-edge
queries and virtual routes use temporary Graphology copies. The audit validation
counts below describe the documentation change before that routing follow-up.
Assertions in the examples document existing behavior, including adapter limitations.
The later inference fix removes the explicit-default-generics workaround from
the save-and-load example. Static factories now match the constructor: metadata
types are defaulted or supplied explicitly, never inferred from policy options.

## 3. Guidance files

### `llms.txt`: consumer contract

The file now starts with version/module/import guidance and identifies the files
actually shipped in the package. It covers coordinate identity versus membership,
retained snapshots, same-graph comparison scope, required metadata factories,
insertion reports, missing results, precision, routing, edits, and adapters.
Six self-contained recipes share checked code with the asserting examples.

The file makes important boundaries explicit: snapshots have no graph pointer;
ownership is not runtime-checked; `weight` is ordinary user data; crossings do not
create adjacency automatically; built-in routing requires no Graphology export;
directed graphs, faces, and native curves are outside the current API.

### `AGENTS.md`: contributor contract

The file already described the current composition layout and complete command
set. Updated conventions correct missing/removal behavior, separate geometry index
updates from metadata edits, explain adapter omissions and snapshot refetching,
and require marked executable snippets. The release reference now points to the
actual README heading. No second contributor policy is introduced.

### `CLAUDE.md`: single source of instructions

The one-line `@AGENTS.md` import is retained. It delegates contributor guidance
to the file already updated, rather than copying an architecture summary that
could become stale. Nothing in it describes the old inherited API. This audit
does not exercise Claude's instruction-loading runtime; it verifies the local
import target and the target's content.

### README and historical material

The README explicitly distinguishes a 2D geometric graph from automatic crossing
connectivity, adds the agent entry path, updates snippets and adapter caveats,
and describes the validation steps run by release CI. Historical sections of the
refactoring audit remain history; its implementation section links to this audit.

## 4. Agent-ready paths

### Agent using an installed package

1. Inspect the installed `@flatten-js/spatial-graph/package.json` version. These
   recipes target 2.0, not the 1.x API.
2. Read `llms.txt` for contracts and common tasks, then README for the API groups.
3. Use `dist/index.d.ts` for ESM or `dist/index.d.cts` for CommonJS to resolve
   exact types. Import only from `@flatten-js/spatial-graph`.
4. Construct graphs through tuples, pass required metadata/factories, inspect
   nullable queries and reports, and refetch snapshots after edits.
5. Use spatial JSON for persistence. Export to Graphology only for external
   algorithms; reacquire the detached adapter after graph changes.

This path needs no unpublished `src`, `examples`, or `docs` files. The shipped
declarations include public JSDoc. The package allowlist is unchanged:
`dist`, `README.md`, `llms.txt`, and `LICENSE`.

### Agent contributing in this repository

1. Read `AGENTS.md` (`CLAUDE.md` delegates to it).
2. Read `llms.txt` and choose examples through `examples/README.md`.
3. Inspect `src/index.ts` for the public surface and the facade/types for details.
   Internal modules are implementation material, not supported consumer imports.
4. Read the refactoring audit for rationale and the consumer inventory for actual
   migration constraints. Separate the historical 1.x findings from section 16's
   delivered 2.0 behavior.
5. Update guidance, marked snippets, and examples together when contracts change,
   then run the repository checks before delivering a PR.

There is no new automation framework, agent-specific export, or documentation
dependency. The reading order, shipped files, and executable contracts supply
the path.

## 5. Example coverage

| Example | Important evidence |
| --- | --- |
| `snapshots.ts` | Old node/edge values survive a move; old-position input no longer finds the moved node; equality/distance and missing query/removal differences |
| `metadata.ts` | Required typed attributes, implicit endpoint factory, explicit metadata updates, optional literal labels, user weight versus geometry, deep clone hook |
| `precision.ts` | Added/existing/collapsed results, no phantom endpoints, exact projection rejected after off-edge grid rounding without partial mutation, unresolved grid crossing |
| `routing.ts` | Short geometric versus cheaper longer path; custom-cost zero A* heuristic; null closes an edge; missing endpoint; virtual access distances and unchanged revision |
| `traversal.ts` | Graphology BFS/DFS wrappers, snapshot/depth callbacks, branch pruning, all-node coverage and missing starts |
| `snap-and-connect.ts` | Connected projection after splitting, replacement of the original edge, endpoint no-op and empty nearest query |
| `planarize.ts` | No initial connectivity through crossings; all intersections split; idempotence; path decomposition covers every edge |
| `cleanup.ts` | Deliberate component selection, single-pass short-stub policy, removal counts, straight join, rejected bend, closed cycle |
| `proximity-graph.ts` | Pairwise construction versus transitive merging, isolated node, displacement larger than merge tolerance |
| `save-and-load.ts` | Full spatial JSON/copy preservation; Graphology geometry and nested data; absent graph metadata; policy-only import with default metadata types; detached edits and stale adapter |
| `geometry-adapters.ts` | Flatten conversions, GeoJSON line/isolated-node metadata, connected-node metadata absent from export, extra-dimensional rejection/opt-in dropping |

These are learning examples rather than an exhaustive API catalogue. Complex
move conflict permutations, overlap metadata reconciliation, custom split IDs,
legacy collisions, invalid generic calls, and package module formats remain
covered by the regression/property and consumer suites. A future example should
add a distinct task or decision; copying an existing example merely to exercise
another accessor adds little teaching value.

## 6. Validation and limits

The recipe test automatically runs all eleven examples against the source alias.
It also checks every `ts` fence in README and `llms.txt`: each must have a named
example marker, import the package root, and match a contiguous code portion in
that example, allowing indentation differences. The assertions after each portion
verify its expected outcome. This checks agreement with executable code, not all
surrounding prose or future declarations.

`pnpm check:examples` separately typechecks those programs against built public
declarations and executes them through package-name imports resolving to `dist`.
CommonJS and browser consumers use their dedicated package probes rather than
Node-specific examples, which intentionally import `node:assert/strict`.

The later traversal example adds BFS/DFS guidance with mirrored README/llms
snippets. The validation counts below record the original ten-example audit run.
The static-import inference fix was separately validated with 95 passing tests
in 11 files, all eleven examples, typecheck/build, package checks, ESM/CJS
declaration and runtime consumers, and Chromium smoke.

Validation completed on Node 24.14.0, macOS arm64:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 75 tests in 10 files, including all ten examples and snippet checks |
| `pnpm build` | Passed |
| `pnpm check:package` | Passed |
| `pnpm check:examples` | Passed |
| `pnpm check:consumers` | Passed |
| `pnpm check:browser` | Passed |

The local verification uses Node 24.14.0 and Chromium 156.0.8078.4; CI is configured for Node 22 and 24 on Linux.
No external application build, publication, Claude runtime, or model-evaluation
experiment is claimed. Benchmark tooling remains outside this repository.

## 7. Remaining recommendations

- Decide separately whether `toGraphology()` should also copy graph-level
  attributes. The current behavior is documented and asserted here; changing it
  requires an implementation change and regression coverage. Spatial policies
  and callback functions still require explicit handling regardless.
- Static import inference is fixed in `fromGraphology` and `fromJSON`; keep the
  ESM/CJS regressions for policy options and explicit required metadata types.
- Migrate the actual consumer separately against the released package if desired.
  It is not a library release gate. Representative repository fixtures remain
  library evidence; they do not claim to validate the external application.
- Refresh version statements when release status is established. A prepared
  `package.json` version alone must not be used as evidence of npm publication.
- Validate model-assisted usage with real consuming tasks if comprehension metrics
  are needed. Static guidance and passing examples establish a usable contract,
  not an empirical measure of generated-code quality.
