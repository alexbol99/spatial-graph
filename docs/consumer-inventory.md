# Phase 0: consumer inventory and baseline

Date: 2026-10-08. Status: complete for what the repository and the consumer's code
can answer; five items need data or a decision from outside (section 9).

This is the Phase 0 deliverable from
[library-refactoring-audit.md](library-refactoring-audit.md), section 13. It
inventories how the single consuming project uses `@flatten-js/spatial-graph`,
and adds the fixtures and baseline tests that later phases must keep green or
change deliberately. No library behavior has changed.

## 1. Scope and baselines

| Item | Value |
| --- | --- |
| Consumer | One graph-editing application. Its graph class `CirculationGraph` subclasses `SpatialGraph`, and the graph editor overlay (`CirculationGraphEditorOverlay`) mutates it. The separate polygon editor (`CirculationEditorOverlay`) does not use the library. Paths below are relative to the consumer's `src/`. |
| Consumer revision scanned | `main` at `98fb378c`, depending on `@flatten-js/spatial-graph@^1.0.1` (lockfile: `1.0.1`) |
| Library API baseline | Branch `codex/fix-issue-6` (PR 19, open): the public surface is `SpatialGraph` plus `EdgeAttributes`, `FilterPredicate`, `IsValidCallback`, `NodeAttributes`, `NxEdge`, `NxPoint`, `SpatialGraphOptions`. All pure geometry helpers, `COORDINATE_PRECISION` and the other constants are gone from the public surface. |
| Library behavior baseline | 1.0.1 (`main`, `6aefd1f`). `codex/fix-issue-6` changes no method behavior except `copy()`, `emptyCopy()` and `nullCopy()` returning a `SpatialGraph`, and the `allowSelfLoops` option. |
| Editor-demo PR | Open (PR 17, `feat/graph-editor-demo`, based on 1.0.0, not yet on 1.0.1). Not merged when this inventory was made. See section 8 for a conflict with PR 19. |

The consumer imports only names that survive PR 19: `SpatialGraph`,
`SpatialGraphOptions`, `NxPoint`, `NxEdge`, `EdgeAttributes`, `NodeAttributes`.
It does not use any removed helper. Two typed fields that PR 19 removes do matter
to it, see section 4.

### How the inventory was made

1. `scan-usage.cjs` ([consumer-inventory/scan-usage.cjs](consumer-inventory/scan-usage.cjs))
   runs the consumer's own TypeScript type checker and records every property
   access that resolves to a declaration in `@flatten-js/spatial-graph`,
   `graphology` or `graphology-types`. That catches inherited Graphology calls and
   calls through the subclass, which a text search for method names would miss or
   over-count. Run it once with the application tsconfig (217 accesses in 787 files)
   and once with the test tsconfig.
2. `.vue` script blocks are not type-checked by the scan. They were searched for
   every member name: five more call sites, all on members already in the list.
3. Call sites were classified by hand as live or reachable only from the
   `beautify` pipeline (section 6).
4. Stored-data shapes, coordinate handling, ids and history were read in the
   consumer's source. Nothing was run against production data.

Re-run the scan at the start of Phase 3 and Phase 4 to check the gate again.

## 2. How the consumer uses the library

- **Subclass.** `CirculationGraph extends SpatialGraph`, so the consumer inherits
  every public and protected member, and passes the subclass to functions typed as
  `SpatialGraph` (`labels.ts`, `editing/corridors.ts`, `editing/junctions.ts`).
  Composition (audit 5.1) removes both the inheritance and the protected members.
- **Type-only imports are the widest dependency.** 44 files import from the
  package (28 production, 16 tests). `NxPoint` is imported in 39 files and `NxEdge`
  in 27; the class itself in 4. Edges are used as plain tuples throughout:
  `const [start, end] = edge`, `edge[0][0]`, and edges passed between helper
  functions. Moving `getEdges()` to snapshot objects will touch most of these.
- **Mutation is live and reversible.** During a drag the editor mutates the graph
  on every pointer move (`moveNode`, `moveNodes`), and a cancelled drag moves the
  nodes back. On release it moves them back to the original position, then applies
  the committed edit through `moveVertexWithTopology` (collapse, split, or plain
  move). So single moves and swaps must be exactly invertible at every step.
- **The graph is rebuilt after every commit.** The editor serializes with
  `toGraphology()` and the host re-creates the graph from that payload
  (`circulationGraphFromApi.ts`). Nothing relies on a mutated graph surviving
  between edits, which makes per-edit snapshot semantics (audit 4.2) a good fit.

## 3. Used members and migration destinations

"Live" counts call sites reachable from the application. "Beautify-only" counts
sites reachable only from the unused `beautify` pipeline (section 6). "Tests"
counts call sites in the consumer's test files. A method on the subclass counts
once per call site, wherever the call is written.

### 3.1 Methods declared by `SpatialGraph`

| Member | Live | Beautify-only | Tests | Destination in 2.0 (audit 7.2) | Consumer notes |
| --- | ---: | ---: | ---: | --- | --- |
| `getNodes` | 9 | 4 | 4 | `getNodes` (snapshots) | Result used as `NxPoint[]`; use `getNodePoints()` or map to `.point` |
| `getEdges` | 21 | 4 | 30 | `getEdges` (snapshots) | Called from 8 files; results used as `[start, end]` tuples. Use `getEdgeSegments()` for tuples |
| `getEdgeAttributesFor` | 7 | 0 | 19 | `getEdgeAttributes` / `edge.attributes` | Reads `width`, `id`, `key`, `label` |
| `getEdgeBetweenPoints` | 6 | 0 | 29 | `getEdgeBetween` | Returns a tuple today; result used as an edge argument |
| `getEdgeKeyFor` | 1 | 0 | 0 | `getEdge(edge) !== null` | Used only as an existence check |
| `getEdgeLabel` / `setEdgeLabel` | 4 / 5 | 0 | 2 / 0 | Keep names | Label write is a no-op on a missing edge today |
| `getNodeLabel` / `setNodeLabel` | 5 / 7 | 0 | 2 / 0 | Keep names | Same |
| `getPointDegree` | 3 | 10 | 1 | `getNodeDegree` / `node.degree` | Missing point returns `0` today; 2.0 returns `null` |
| `getPointNeighbors` | 8 | 4 | 0 | `getNeighbors` | Consumer takes `[first, second]` by position in the beautify path; order is graphology insertion order |
| `getPointKey` | 5 | 0 | 3 | `getNodeKey` | Used to compare points and to write stored node keys |
| `hasPointNode` | 4 | 1 | 44 | `hasNode` | |
| `getJunctions` / `getStubs` | 2 / 2 | 0 | 1 / 1 | Keep names (return nodes) | Renderer only; classification must map to its three categories |
| `isStub` | 0 | 2 | 0 | `getNodeType(node) === 'stub'` | |
| `getClosestNodeToPoint` | 7 | 0 | 0 | `findNearestNode` | Throws on an empty graph today; 2.0 returns `null`. The drag-commit paths call it without a guard |
| `projectPointOnClosestEdge` | 4 | 0 | 0 | `findNearestEdge` | Result destructured as `[point, edge]`; always called under a `size > 0` guard |
| `splitEdge` | 8 | 0 | 1 | `splitEdge` (validated, reports) | See 7.1: depends on id regeneration and an unvalidated split point |
| `moveNode` / `moveNodes` | 4 / 3 | 2 / 4 | 3 / 1 | Keep names (transactional) | Live: drag, cancel, commit, orthogonal corridor move |
| `collapsePointInto` | 2 | 0 | 0 | `mergeNodeInto` | Destination attributes win; the moved node's label is dropped |
| `removeStubPoint` | 1 | 0 | 0 | `removeStubNode` | |
| `removeDegree2PointAndJoin` | 1 | 0 | 0 | `joinNode` or `collapseDegree2Node` | See 7.2: consumer joins across bends |
| `removeEdge` | 1 | 0 | 2 | `removeEdge` | |
| `removePoint` | 1 | 0 | 0 | `removeNode` | Consumer prunes isolated end nodes itself |
| `findPaths` | 1 | 1 | 0 | `findPaths` (structured) | Live use: buffering polylines into a polygon; must keep every-edge-once and closed cycles |
| `getConnectedComponents` | 1 | 0 | 0 | `getConnectedComponents` | Order feeds label numbering (7.4) |
| `getNeighborsByLeftTurn` | 1 | 0 | 0 | Keep, direction as `Vector2D` | Already called with a direction vector (`next - node`), so no semantic change |
| `addEdgeWithAttrs` (protected) | 1 | 1 | 0 | `addEdge(tuple, attrs)` | Subclass use; protected access disappears with composition |
| `parseNode` (protected) | 3 | 0 | 0 | Consumer's own `parsePointKey`, or a documented key lookup | Used to turn stored `"x,y"` keys back into points |
| `mergePointAttributes` | 1 | 1 | 0 | `mergeNodeAttributes` / `addNode` | The only live call is the constructor's unused `nodeAttrs` option |
| `getPointAttributes` | 0 | 2 | 5 | `getNodeAttributes` | |
| `mergeEdgePointAttributes` | 0 | 1 | 0 | `mergeEdgeAttributes` | |
| `removeEdges` / `removePoints` | 0 | 1 / 1 | 0 | `removeEdges` / `removeNodes` | |
| `getEdgeWeight` | 0 | 16 | 0 | `getEdgeLength` | All uses read geometric length |
| `getLongestEdgeInPath` | 0 | 1 | 0 | `getLongestEdge` | |
| `findIsolatedPaths` | 0 | 1 | 0 | `findTerminalPaths` | |
| `calculatedMovement` | 0 | 1 | 0 | Application code (audit 7.2) | |

Members declared on `SpatialGraph` that the consumer never calls: `addSegment`,
`addSegments`, `addVertex`, `removeSegment`, `getSegments`, `getVertices`,
`hasOrthogonalEdges`, `getNodesWithOrthogonalEdges`, `findNearestEdge`,
`getShortestPath`, `getSubgraph`, `getFilteredNodes`, `getPathLength`, `union`,
`createCompleteGraph`, `copy`, `emptyCopy`, `nullCopy`. The consumer does not
route at all; routing has no consumer flow to regress. The segment-based
insertion methods are reached only through the constructor's `segments`/`attrs`
options (`circulationGraphFromApi.ts`), which is how every stored graph is built.

### 3.2 Inherited Graphology members

| Member | Live | Beautify-only | Tests | Where | Destination |
| --- | ---: | ---: | ---: | --- | --- |
| `size` / `order` | 4 / 0 | 0 | 9 / 3 | Emptiness guards, test assertions | **Not named in the audit.** Add `edgeCount`/`nodeCount` (or keep `size`/`order` as documented aliases) |
| `getAttribute` / `setAttribute` | 2 / 5 | 0 | 2 / 0 | `labels.ts`, `circulationGraphFromApi.ts`, `toGraphology` | Explicit graph-metadata methods (audit 7.2 raw table). The consumer stores two numbers there (label counters) |
| `forEachNode` / `forEachEdge` | 1 / 3 | 0 | 0 | `ensureEditingIds`, width updates by id | `getNodes()` / `getEdges()` iteration; callback gives graphology key, source and target |
| `setNodeAttribute` / `setEdgeAttribute` / `getEdgeAttribute` | 1 / 1 / 1 | 0 | 0 | `ensureEditingIds` | Spatial attribute methods on a node or edge input |
| `mergeEdgeAttributes` | 2 | 0 | 0 | Width updates, selected by graphology edge key | `mergeEdgeAttributes(edge, attrs)`; consumer must hold edges, not graphology keys |
| `clear` | 0 | 1 | 0 | `simplifyCirculationGraph` (beautify) | Not named in the audit; unneeded if beautify is removed |

Not used anywhere: `export`, `import`, `copy`, event listeners (`graph.on`),
`instanceof` checks, `Graph.from`, graphology algorithms passed the graph. The
only `.on(...)` calls in the consumer's graph code are on the canvas viewport.

**Gaps against the audit.** Four members have no destination in section 7.2:
`size`/`order`, `clear`, the graph-level `getAttribute`/`setAttribute` pair (named
only generically), and a reverse lookup from a node key to a node (`parseNode` is
protected today; the consumer persists keys in corridors and stored JSON). Decide
these in Phase 1.

## 4. Typed attributes the consumer reads

`EdgeAttributes` and `NodeAttributes` on 1.0.1 declare `width`, `clearanceWidth`
(edges) and `radius`, `closestGeoms` (nodes). PR 19 removes them and leaves
`[key: string]: unknown`. The consumer reads two of them:

| Field | Reads | Effect of removal |
| --- | --- | --- |
| `edge.width` | `CirculationGraph.ts` (`toGraphology`, width buffering), `editing/junctions.ts`, 2 specs | `attrs.width > 0` no longer compiles (`unknown`); confirmed by typechecking an adapter written that way on `codex/fix-issue-6`. One site already narrows with `typeof`; `toGraphology` does not |
| `node.closestGeoms` | `getClosestGeomsDict`, beautify path only | None in production |

The consumer also writes `clearanceWidth` through `Pick<EdgeAttributes,
'width' | 'clearanceWidth'>` (`measureCorridorWidth`, beautify path only).

Under the 2.0 design (audit 4.1, 5.1) the consumer defines its own attribute
types and passes them as `SpatialGraph<N, E>` generics. That removes the
casts and satisfies "type declarations preserve consumer attribute types".

## 5. Metadata inventory

| Where | Key | Written by | Persisted | Meaning |
| --- | --- | --- | :-: | --- |
| Edge | `type` | load, add | no | Constant `'skeleton'` |
| Edge | `width` | load (`corridor_width`), `addSkeletonEdge`, width edits, `refreshEdgeWidths` | yes, as `corridor_width` | Corridor width in plan units; clamped 80..450 on edit; default 140 |
| Edge | `key` | load (producer's edge key) | yes, as the edge `key` (fallback `edge-<index>`) | Traceability to the producer's edge |
| Edge | `label` | label assignment (`b1`, `b2`, ...) | yes | User-visible name, cited by people and by an agent |
| Edge | `id` | `ensureEditingIds` | no | Stable in-session id (`"k1|k2"` of the end keys at creation); selection survives coordinate changes |
| Edge | `weight` | the library, always | no | Segment length. **The consumer never writes `weight`**; it reads it only in the beautify path |
| Edge | `clearanceWidth` | beautify path only | no | Raw measured width |
| Node | `label` | label assignment (`n1`, ...) | yes | User-visible name |
| Node | `id` | `ensureEditingIds` | no | Stable in-session id (the creation key) |
| Node | `closestGeoms` | constructor `nodeAttrs` option only | no | Never set in production |
| Graph | `nextNodeLabelIndex`, `nextEdgeLabelIndex` | label assignment | yes | Counters so a retired label is never reused |

Consequences for the refactor:

- **User identity that must survive edits is the labels**, not the in-session
  ids. Labels are user-visible, persisted and cited. Every move, merge, split and
  join must keep them predictable; the consumer reconciles duplicates after the
  fact (`reconcileLabels`) and relies on the library not to lose the surviving one.
- **`weight` is only ever a geometric length here**, so "derived length, user
  `weight` is just data" (audit A4) cannot break the consumer. No fixture needs a
  user-set weight.
- **`type`, `id`, `width`, `key` are ordinary user data** to the consumer, which
  matches audit 5.1 (user attributes named `x`, `type`, `length` or `id` stay
  data). The consumer relies on the *library* regenerating `id` on split, which
  2.0 will not do (7.1).

## 6. Dead code: the `beautify` pipeline

`CirculationGraph.beautify()` and the methods it calls (`straightenCorners`,
`straightenTjunctions`, `removeShortStubSegments`,
`collapseShortDegree2CornerSegments`, `adjustShortMiddleSegments`,
`simplifyCirculationGraph`, `straightenSkeletonLines`, `refreshEdgeWidths`, and
their private helpers) have **no caller in application code**. The only callers
are `__tests__/circulationGraphTopology.node.spec.ts`. The graph now comes from a
backend that returns a clean skeleton (documented in `circulationGraphFromApi.ts`:
"the graph is intentionally not beautified").

That pipeline accounts for 60 of the 222 library accesses in application code, and it is the sole
user of `getEdgeWeight`, `calculatedMovement`, `findIsolatedPaths`,
`getLongestEdgeInPath`, `isStub`, `removeEdges`, `removePoints`,
`mergeEdgePointAttributes`, `getPointAttributes`, `clear`, `closestGeoms` and the
`nodeAttrs` option.

**Recommendation to the consumer:** confirm nothing outside the repository
invokes it, then delete it before migrating. That removes seven members from the
migration list and removes every use of the overloaded `weight`. If it must stay,
its tests become the regression check for `getEdgeWeight`, `findIsolatedPaths` and
`calculatedMovement`; no fixture here covers them.

## 7. Behaviors the consumer depends on

Each item names the baseline test that records it
([consumer-baseline.node.spec.ts](../src/__tests__/consumer-baseline.node.spec.ts))
and what Phase 1 or 2 must do about it.

### 7.1 Split regenerates `id`, copies everything else, and validates nothing

`splitEdge` copies all attributes to both halves, deletes `id`, and writes a fresh
`"k1|k2"` id on each half when the original had one. It does not check that the
split point is on the edge. The consumer's corridor detection and selection key
off the stored `id` (`edgeIdForEdge`), and it splits at fractional projections and
crossings that the library rounds.

- The audit's "do not reinterpret `id`" (section 8, Splitting) means both halves
  keep the **same** `id` after a 2.0 split. The consumer must supply a
  `splitAttributes` callback that assigns ids, or call `ensureEditingIds` after
  every split. Phase 2 needs a test in this repository for exactly that callback.
- Baseline tests: *splits an edge*, *persists the duplicated key and label of a
  split*, *does not check that the split point lies on the edge*.
- **Duplicated `key` and `label` are persisted today.** After a split, both halves
  carry the producer's `key`, so `toGraphology()` emits two edges with the same
  key, and two with the same label. The consumer repairs labels on the next
  `reconcileLabels`; the duplicate key is stored as is. A `splitAttributes` hook
  fixes both.
- **Off-grid projections.** A projection such as (90.9, 30.3) is rounded to
  (91, 30), 0.32 units off the edge. Both `projectPointOnClosestEdge` and the
  consumer's `findEdgeCrossings` produce such points. A 2.0 `splitEdge` that
  validates containment (audit A5) will reject or reshape them unless the graph is
  configured with a position tolerance of at least half a cell diagonal (about
  0.71 for `coordinatePrecision: 0`). Baseline test: *splits at a projection
  between grid points*. Phase 1 should set the default accordingly or document
  the required option.

### 7.2 Joining across a bend is a feature

`removeDegree2PointAndJoin` joins any degree-2 node, bent or straight. The
consumer's "delete vertex" calls it on bends, and relies on the shape changing
(the two edges become one straight shortcut). The audit's safe `joinNode`
(straight only) would turn that into a no-op. The consumer must call the explicit
`collapseDegree2Node` for bends and `joinNode` for collinear nodes, which means
choosing by classification (`corner` vs `intermediate`) at the call site.

- Baseline tests: *joins a collinear pass-through node*, *also joins across a
  bend*, *replaces the joined attributes when the caller supplies them*.
- By default the merge is "second neighbour wins", in graphology neighbor order
  (here the edge with key `b3#0` and label `b4` survives, not `b2#0`/`b3`). The
  consumer already overrides this with its own `joinedEdgeAttributes` (longer edge
  wins, key-order tie-break). A `joinAttributes` callback replaces that workaround;
  keep the consumer's rule as the acceptance case.

### 7.3 Moves

| Behavior | Baseline test | Phase 2 requirement |
| --- | --- | --- |
| Plain move keeps edge `key`, `id`, label; recomputes `weight`; keeps edge orientation | *moves a node in place* | Same. A stale `id` after a move is intentional |
| Move onto an existing node merges; destination attributes win, so the moved node's label is lost | *merges into an existing node* | Same default (audit 8, Moving and merging) |
| `collapsePointInto` and a move onto a node give identical results | *collapsePointInto gives the same result* | `mergeNodeInto` and `moveNode` share one policy |
| Swaps and chains of simultaneous moves resolve on the original state | *rewiring a swap*, *chain of moves* | Same, order-independent. The consumer only moves in chains through corridor drags |
| A fractional target is rounded on the grid | *rounds a fractional move target* | Same under `coordinatePrecision: 0` |
| Moving a missing node throws before anything changes | *throws before changing anything* | Same (audit 7.3) |

### 7.4 Ordering is observable

The consumer's labelling walk starts from `getConnectedComponents()` and
`getNeighborsByLeftTurn(...)`, and picks `[first, second]` neighbors by position.
Baseline tests *keeps insertion order for nodes, edges and neighbours* and *splits
the graph into components in discovery order* pin the current orders. If 2.0
changes any of them (canonical ordering is proposed for some conflict resolution),
the stored labels of existing plans do not change, because labels are persisted,
but newly labelled graphs will number differently. Treat that as an intended
change and record it here when it happens.

Implemented 2.0 change: `getConnectedComponents()` now delegates to
`graphology-components` and visits nodes in DFS order rather than BFS order.
Component membership and isolated-node handling are preserved. Newly assigned
labels may differ within a component; persisted labels remain unchanged.

### 7.5 Neutral values for missing members

The consumer relies on `0`, `[]`, `{}` and `null` for missing points in places
(`getPointDegree(...) === 0` to prune isolated nodes, `getEdgeAttributesFor(...)?.`).
2.0 switches to `null` for degree, attributes and nearest queries (audit 7.3).
Sites to review: `removeEditableEdge`, `moveVertexWithTopology`,
`removeEditableVertex`, the drag-commit functions, and anywhere a missing node
returns `0` for degree. Test: *answers missing points with neutral values*.

## 8. Coordinates and precision

- **Unit and scale.** Plan units are centimetres (the consumer's
  `docs/circulation/graph-editing-design.md`). The consumer's tests use
  coordinates in the hundreds to low thousands and widths of 80..450; the fixture
  network follows that scale. Real stored coordinates were not sampled (9.4).
- **Integer grid.** The consumer assumes nodes live on whole units. Its own
  `sameGraphPoint` rounds to precision 0 to mirror the library, and the stored
  skeleton contains whole numbers only, because `toGraphology` writes rounded node
  coordinates. **A 2.0 graph for this consumer must be created with
  `coordinatePrecision: 0`** (audit 6); the new `null` default would change every
  node key and every comparison in the consumer.
- **Producer data may be fractional.** The backend's own graph is loaded through
  the same constructor, so its coordinates are rounded on load. Baseline test
  *snaps producer coordinates to the whole-number grid* shows two quirks the
  consumer inherits: endpoints of the "same" junction that straddle `.5` become two
  nodes (the component splits), and an edge that rounds to zero length is silently
  dropped. Phase 2's legacy import should report both as collisions.
  Whether real producer data hits this depends on its coordinate precision, which
  could not be checked (section 9).
- **`getPointKey` and `"x,y"` keys are persisted** in stored node keys and in the
  consumer's corridor `nodeKeys`. The key format for precision 0 must stay `"x,y"`
  with integers, or the consumer's `parsePointKey` and stored data break.
- **Open-PR conflict.** The demo on PR 17 imports `findIntersection`,
  `nearestPointOnSegment` and `roundPoint` from the package. PR 19 removes all
  three from the public surface. Whichever merges second needs the demo to stop
  importing them (inline `roundPoint`, local nearest-point code) or those exports
  need to come back. The consumer is unaffected.

## 9. Stored data, history and the Phase 0 gate

### 9.1 Stored data and import strategy

The consumer does not store Graphology's `export()` output. It stores its own
graphology-shaped JSON, `CirculationGraphology` (`entities/circulation/model/circulationGraph/CirculationGraph.ts`):

```ts
{ attributes?: { nextNodeLabelIndex?: number; nextEdgeLabelIndex?: number },
  nodes: [{ key: 'x,y', attributes: { x, y, label? } }],
  edges: [{ key, source, target,
            attributes: { coords: [[x, y], [x, y]], corridor_width, label? } }] }
```

It is held in the design state as `skeleton` and saved through the app's own API
(`useUpdateCirculationMutation`, `softPlanService`). Initial graphs come from a
backend run (`simpleCircService`) whose edges carry extra attributes (`length`,
`branch_id`, `segment_index`, `kind`, `is_connector`) and, in older versions,
nest the graph under `graphology`.

So **there is no persisted library format to migrate.** The import strategy is:

1. Keep reading and writing the consumer's own JSON; geometry is `coords`, so it
   is independent of the library's internal storage and key format.
2. Rewrite only the two adapter functions (`buildCirculationGraphFromApi`,
   `toGraphology`) for the new API. Their reference behavior is
   [fixtures/consumer/adapter.ts](../src/__tests__/fixtures/consumer/adapter.ts)
   (`loadStored`, `toStored`), and the baseline tests round-trip through them.
3. The library's legacy-import path (audit 10) is not needed by this consumer.

Two inconsistencies in the consumer's own data worth fixing at the same time:
the type comment says `corridor_width` is millimetres while the design document,
default (140) and clamp (80..450) are centimetres; and a polyline edge with more
than two coordinates would be split into several library edges that all carry the
same edge `key`.

### 9.2 Editor history and events

History is store-level: each commit emits `geometryChange(wkt, skeleton)`, the
store records one history entry holding the polygon and the serialized skeleton,
and undo/redo replaces both and rebuilds the graph. There are no library events,
no graph-level undo, and no retained graph objects across edits. Nothing in the
consumer depends on Graphology events, so audit 7.2's "controlled mutation events
if used" is not needed for it.

### 9.3 Gate status

| Gate (audit section 13, Phase 0) | Status |
| --- | --- |
| Every used method has a migration destination | **Met with four gaps**: `size`/`order`, `clear`, graph-level attribute accessors and key-to-node lookup need decisions (3.2) |
| Stored files have an import strategy | **Met** (9.1). Consumer-owned JSON, no library format |
| Integer precision known | **Met**: whole centimetres, `coordinatePrecision: 0` (8). Real producer precision **not verified** |
| Geometric weight assumptions known | **Met**: `weight` is only a derived length, never user data (5) |
| Representative anonymized fixtures | **Met with a caveat**: synthetic, not derived from real plans (10) |
| Baseline routes and edit outcomes | **Met**: 36 tests. The consumer has no routing flow, so only library-level route checks exist |
| Editor-demo PR status | **Open**, not merged (1) |

### 9.4 Not answerable from the repositories

1. **Real stored skeletons and backend output.** Whether real coordinates are
   whole numbers, how often two endpoints straddle `.5`, and how many edges round to
   zero length. A read-only pass over a few anonymized stored `skeleton` payloads
   (count nodes, non-integer coordinates, duplicate edge keys, labels not matching
   `^[nb][1-9]\d*$`) would settle it. Real data was not touched.
2. **Whether anything outside the repository calls `beautify`** (other services,
   notebooks). If not, delete it (6).
3. **`corridor_width` unit** (mm or cm) at the backend boundary (9.1).
4. **Whether the consumer wants `getEdges()` tuples or snapshots** at the 8 files
   that destructure edges. That decides how large the Phase 3 edit is.
5. **PR 17 versus PR 19** (8): which exports the demo keeps.

## 10. Fixtures and baseline tests

| File | What it is |
| --- | --- |
| [fixtures/consumer/stored-skeleton.json](../src/__tests__/fixtures/consumer/stored-skeleton.json) | The consumer's persisted shape. 12 nodes, 11 edges, whole-centimetre coordinates, a T-junction, a closed loop through a junction, a collinear degree-2 node, a bend, a 200-wide edge, a separate component, labels and counters |
| [fixtures/consumer/producer-skeleton.json](../src/__tests__/fixtures/consumer/producer-skeleton.json) | Backend-shaped edges: fractional coordinates, extra attributes, no labels, one edge that rounds to zero length |
| [fixtures/consumer/adapter.ts](../src/__tests__/fixtures/consumer/adapter.ts) | `loadStored`, `toStored`, `ensureEditingIds`: the consumer's load and store contract, written against the public API |
| [consumer-baseline.node.spec.ts](../src/__tests__/consumer-baseline.node.spec.ts) | 36 tests: 13 on loading, queries, ordering and route, 3 on stored data, and 20 edit outcomes |

The fixtures are **synthetic and anonymous**: the shapes come from what the
consumer's tests and stored format look like, not from any customer plan or data
file. Names and values carry nothing identifying.

The spec imports only `SpatialGraph` and the type exports, so it runs unchanged on
both baselines. Verified: 36/36 on the audit branch (1.0.1 plus the copy fix) and
on `codex/fix-issue-6` with `pnpm typecheck` clean on both.

How later phases use it:

- **Phase 1:** make the adapter compile against the new API (`coordinatePrecision:
  0`, typed attributes). The expectations about nodes, edges, labels, widths, paths
  and components should pass unchanged; only call syntax changes.
- **Phase 2:** each "Baseline quirk" comment marks an expectation that a fix will
  change on purpose (duplicated split metadata, off-edge split, bend join,
  zero-length drop, unspecified join winner). Change the test and add a line to
  section 7 in the same commit.
- **Phase 3:** the route and component tests are the reference for the
  structured-path and head-index BFS rewrites.
- **Phase 4:** re-run `scan-usage.cjs` against the migrated consumer and confirm
  no used member lacks a destination.

## 11. Redesign fixture migration (2026-10-10)

The fixture adapter now uses the 2.0 composition API, explicit integer precision,
and `ConsumerNode`/`ConsumerEdge` generics so width remains a number. The original
36 baseline tests recorded historical behavior. They have been replaced with
eight consumer-flow acceptance tests plus broader library invariant tests;
known quirks are not retained as 2.0 requirements. Off-edge split now rejects,
straight joining is safe by default, bend/triangle collapse is explicit, and
editor ID changes use a split callback. Exact projections remain fractional;
an editor choosing grid displacement supplies an explicit position tolerance.

The stored/producer fixtures are unchanged. Load/save, labels/counters, width,
identity preservation, simultaneous edits, snapping and split/connect are covered.
The real consuming project is not checked out in this workspace; this confirms
the representative adapter contract, not migration of its 44 importing files
or execution of its build/tests. Section 9.4's external-data decisions remain
consumer migration checks. By the owner's release decision, migration can target
the published 2.0 package and does not gate library release.
