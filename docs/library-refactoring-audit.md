# SpatialGraph audit and refactoring proposal

Created: 2026-10-05. Updated: 2026-10-10. Status: 2.0 library implementation
on `codex/spatial-graph-redesign`; composition and the core/follow-up library
features below are implemented. Publication remains tag-driven; consumer migration
is separate work and may target the released version, not a release gate.
[Section 16](#16-implementation-status-and-validation) records the delivered
API, checks, measurements, and limitations.

Audited baseline: `main`, commit
[`6aefd1f`](https://github.com/alexbol99/spatial-graph/tree/6aefd1fda1c0065b16ff3b87473590a6a0386a0b),
package version `1.0.1`. This document was prepared on
`codex/spatial-graph-refactoring-audit`, created directly from that commit after
confirming local `main` and `origin/main` matched.

Current upstream status: [`v1.1.0`](https://github.com/alexbol99/spatial-graph/releases/tag/v1.1.0)
was released on 2026-10-09 from `main` after
[PR #19](https://github.com/alexbol99/spatial-graph/pull/19) removed redundant
public exports. This branch has now merged that 1.1.0 `main` commit and retains
the [Phase 0 consumer inventory](consumer-inventory.md), fixtures, and baseline
tests. Sections 2–3 and Appendix A record the original 1.0.1 audit; current
status and remaining work are called out where they affect the plan. The original
audit findings remain historical evidence, not descriptions of the new class.

### Contents

1. [Recommendation and scope](#1-recommendation-and-scope)
2. [Audit method and baseline validation](#2-audit-method-and-baseline-validation)
3. [Findings](#3-findings-grounded-in-the-current-implementation)
4. [Target data model](#4-target-data-model)
5. [Graphology architecture and ownership](#5-graphology-architecture-and-ownership)
6. [Coordinates, precision, and exact geometry](#6-coordinates-precision-and-exact-geometry)
7. [Public API and migration](#7-proposed-public-api-and-migration)
8. [Mutation contracts and metadata](#8-mutation-contracts-and-metadata-policy)
9. [Algorithms and feature boundaries](#9-algorithms-performance-and-feature-boundaries)
10. [Serialization, exports, and dependencies](#10-serialization-adapters-exports-and-dependencies)
11. [Original issue disposition](#11-disposition-of-the-issues-in-the-original-audit)
12. [Implementation layout](#12-suggested-implementation-layout)
13. [Implementation phases](#13-implementation-phases-and-acceptance-gates)
14. [Verification plan](#14-verification-plan-for-the-refactor)
15. [Decisions and risks](#15-decisions-and-risks-to-carry-into-implementation)
16. [Implementation status and validation](#16-implementation-status-and-validation)

[Appendix: reproducible probes](#appendix-a-reproducing-the-main-correctness-probes)

## 1. Recommendation and scope

Refactor the library around explicit graph elements and separate geometric
values. Introduce `SpatialNode` and `SpatialEdge` classes as immutable snapshots,
provide consistent node/edge methods on `SpatialGraph`, and centralize coordinate
normalization, mutation, and attribute handling.

**Decision: use composition with Graphology.** `SpatialGraph` will own a private
Graphology graph instead of extending it. The library owner selected this
architecture after the original audit. It permits consistent methods such as
`addNode(point)` without conflicting with inherited key-based methods, and
prevents raw graph mutations from bypassing spatial invariants. Section 5
compares the alternatives and defines the migration cost.

The company controls the only current consuming project and accepts breaking
changes. Make one coordinated major-version migration, rather than maintaining
old aliases and multiple incompatible models. Use `2.0.0` as the proposed release
boundary; implementation phases below can be separate branches/PRs before release.

The first release should establish a sound model, correct geometry and mutations,
consistent queries, and structured length-based routing. Custom routing cost is
a natural extension of that model. A spatial index, planarization, and adapters
follow it; directed graphs, arcs, and face extraction should not hold up the core
refactor.

### Requirements carried forward from our discussion

- `graph.getNode(point)` returns an object usable as `node?.type`.
- Node and edge classes do not extend Graphology node/edge classes; Graphology
  stores keyed elements and attribute dictionaries, not such base classes.
- Returned objects have no reference to their graph. They describe the state at
  retrieval time; fetch again after editing to obtain current topology/attributes.
- Moving removes the old node and creates or merges a destination node; retained
  objects do not follow the move.
- Equality is coordinate-based within one graph. Cross-graph identity checking
  and lifetime tokens are not requirements.
- Nodes provide a Euclidean distance operation and an equality predicate.
- Graph methods expose node classification, edge midpoint, and geometric length;
  edge snapshots also expose convenient properties.
- Node/edge refers to graph membership; point/segment refers to geometry. A
  midpoint or projection is a point, not automatically a node.

The implementation adopts five node classifications, exact coordinates by
default, and the node/edge vocabulary below. Composition is a settled
architectural decision. Phase 0 found that the consumer needs explicit integer precision and
currently subclasses `SpatialGraph`; its migration is described in section 13.

## 2. Audit method and baseline validation

Read the full `SpatialGraph` implementation, public types/constants/exports,
geometry helpers, tests, all examples, README, `llms.txt`, package configuration,
and CI/release workflows. Retrieved the 12 issues open on 2026-10-05, checked
the status of issue #8 and its merged PR, and inspected the description/file list
of the open editor-demo PR. The open issues had no comments at retrieval time.

Ran the existing checks on the baseline using Node `24.14.0` and pnpm `11.1.3`:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 115 tests in 6 files, including runnable examples |
| `pnpm build` | Passed: ESM, CJS, and both declaration formats |
| `pnpm check:package` | Passed: publint and are-the-types-wrong |
| `pnpm check:examples` | Passed against built `dist` |

Additional behavioral probes ran against that **1.0.1** build. They are
described below; these probes are diagnostic evidence, not newly committed tests. The
115 passing tests validate existing expectations, including some behavior this
proposal intentionally changes. No browser-runtime matrix, external consuming
project, fuzz campaign, or performance benchmark was run. Timings in issue #4
are historical issue-author measurements, not measurements from this audit.

Important existing strengths to preserve:

- Small package, explicit ESM/CJS exports, shipping declarations and JSDoc.
- Shared Flatten peer dependency and runnable documentation recipes.
- Simultaneous movement planning and existing merge/copy tests.
- Undirected simple graph semantics and generic spatial use cases.
- Tag-driven publishing with provenance; no local npm publishing.

## 3. Findings grounded in the current implementation

Priority describes implementation order: P1 means a correctness/invariant issue
to address before adopting the redesigned API; P2 means API, maintainability, or
performance work. Feature requests are listed separately from defects.

### A1 — P1: spatial invariants can be bypassed through inherited methods

Source: [`SpatialGraph` inheritance and `parseNode`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/SpatialGraph.ts).
Related: [#10](https://github.com/alexbol99/spatial-graph/issues/10),
[#11](https://github.com/alexbol99/spatial-graph/issues/11),
[#12](https://github.com/alexbol99/spatial-graph/issues/12).

`addNode('label')` is valid Graphology usage, but the node disappears from
`getNodes()` because its key cannot be parsed as coordinates. `addNode('1junk,2')`
is reported by `getNodes()` as `[1, 2]`, because `parseFloat` accepts the numeric
prefix. Point-based lookups then generate the different key `"1,2"`.

Probe: after adding those two raw keys, `order === 2`, while `getNodes()` returns
only `[[1, 2]]`. Thus graph order, spatial iteration, and point lookup disagree.
Raw imports can introduce the same problem. Self-loops are also allowed through
raw methods by default but skipped by spatial insertion methods.

Recommendation: own the storage boundary; validate every insertion/import;
store coordinates explicitly; reject unsupported topology. If inheritance is
retained, all raw mutation paths need a documented and tested validation policy.
Post-mutation events alone do not make invalid mutations atomic.

### A2 — P1: snapping can produce a projected point outside its claimed edge

Source: [`projectPointOnClosestEdge`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/SpatialGraph.ts),
[`projectPointOnSegment`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/utils/projection.ts), and
[`fromFlattenPoint`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/utils/geometry.ts).
Related: [#15](https://github.com/alexbol99/spatial-graph/issues/15),
[#9](https://github.com/alexbol99/spatial-graph/issues/9).

For edge `[[0, 0], [3, 1]]` and query `[1, 1]`, the exact nearest point is
approximately `[1.2, 0.4]`. The graph projection method returns `[1, 0]`, which
is not on that segment. This contradicts the result's description as the point
on the returned edge. The snap/split recipe then introduces a bend.

Recommendation: exact geometry results; quantize only at graph insertion when
the graph is configured to do so. If quantization moves a split point off its
edge, reject the split by default and report the reason. Explicitly changing
geometry must be a different, deliberate operation.

### A3 — P1: malformed numeric coordinates are not rejected

Source: [`roundPoint`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/utils/geometry.ts), `addVertex`, and `parseNode`.
Related: [#15](https://github.com/alexbol99/spatial-graph/issues/15).

Probe: `addVertex([Infinity, 0])` and `addVertex([NaN, 0])` both add Graphology
nodes. Spatial iteration exposes the infinite coordinate and omits the NaN one.
JSON stringification renders Infinity as `null`, obscuring the underlying value.

Recommendation: require two finite coordinates at graph boundaries and validate
normalization results. Invalid data throws an actionable error before mutation;
it is not treated as a harmless skipped degenerate segment. Also validate
precision, tolerances, and algorithm parameters.

### A4 — P1: `weight`, geometric length, and user metadata can diverge

Source: `addEdgeWithAttrs`, `getEdgeWeight`, `getPathLength`, and
`getShortestPath` in [`SpatialGraph.ts`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/SpatialGraph.ts).
Related: [#5](https://github.com/alexbol99/spatial-graph/issues/5),
[#9](https://github.com/alexbol99/spatial-graph/issues/9).

Insertion overrides user `weight` with geometric length, but attribute access
returns live dictionaries. Probe: assigning `-5` through `getEdgeAttributesFor`
changes both `getEdgeWeight` and `getPathLength` to `-5` for a length-10 edge.
Rebuilding that edge during a move recalculates weight again. Routing therefore
does not always mean the geometric length claimed by the documentation.

`getPathLength` silently assigns zero to missing path edges.
`getLongestEdgeInPath` can return a pair that is not an actual graph edge, because
missing edges participate with weight zero.

Recommendation: compute geometric length from endpoints; keep user attributes
separate; use an explicit cost callback for routing; return `null` for nonexistent
graph edges/invalid graph paths. Reject negative/non-finite costs before routing.

### A5 — P1: splitting and simplification need explicit geometric contracts

Source: `splitEdge` and `removeDegree2PointAndJoin`.
Related: [#9](https://github.com/alexbol99/spatial-graph/issues/9),
[#7](https://github.com/alexbol99/spatial-graph/issues/7).

Probe: splitting `[[0, 0], [10, 0]]` at `[5, 50]` creates a dogleg, as currently
documented. Removing the apex of a triangle leaves two nodes and one edge,
destroying the cycle. Removing a bent degree-2 node otherwise replaces two
segments by a chord and changes total geometric length.

These are current supported behaviors, but names such as split and pass-through
cleanup invite a stronger expectation of geometry preservation.

Recommendation: validated splitting by default; a safe `joinNode` operation
that only removes straight degree-2 nodes and rejects an already-connected pair
of neighbors. Preserve deliberate bend removal under a separately named
`collapseDegree2Node` operation, with documented cycle/topology effects.

### A6 — P1: simultaneous movement is not order-independent under conflicts

Source: `moveNodes` and `collapsePointInto`.
Related: [#13](https://github.com/alexbol99/spatial-graph/issues/13).

Movement does correctly snapshot sources before dropping them. However, when
two moved nodes arrive at the same empty destination and carry conflicting
attributes, the first inserted node wins. Probe: sources with `{value: 'a'}` and
`{value: 'b'}` moved to `[20, 0]` yield `'a'` in one input order and `'b'` when
the input order is reversed. Repeated entries for one source also use the last
destination. Recreated duplicate edges can discard metadata, while collapse
uses a different merge rule.

Recommendation: reject contradictory moves for one source; canonicalize merge
groups; apply one conflict policy shared by moves, merges, splits, and union.
Do not claim unconditional order independence unless conflicts are defined.

### A7 — P2: public names and result types do not express one model

Source: [`types.ts`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/types.ts) and the full public `SpatialGraph` API.
Related: [#11](https://github.com/alexbol99/spatial-graph/issues/11).

Node lists use `NxPoint`, vertex lists use Flatten `Point`, nearest-edge and
shortest-path queries use Flatten `Segment`, and edge lookup uses endpoint
tuples. Object identity, geometric location, and graph membership must be
reconstructed separately by callers. Attribute names mix point, node, and edge.

Recommendation: element queries return snapshot classes; geometric calculations
return coordinates/segment values; Flatten conversion methods say `Flatten` in
their names. The migration table in section 7 covers the current methods.

### A8 — P2: geometry conversion also changes coordinates

Source: `fromFlattenPoint`, `fromFlattenSegment`, `findIntersection`,
`findLineIntersection`, and projection helpers.
Related: [#15](https://github.com/alexbol99/spatial-graph/issues/15),
[#7](https://github.com/alexbol99/spatial-graph/issues/7).

Some helpers quantize through the global precision and others return exact
values. `findIntersection` returns a rounded crossing, but
`findLineIntersection` returns an exact crossing. `nearestPointOnSegment`
returns exact coordinates while `projectPointOnSegment` snaps.

Recommendation: pure conversions preserve coordinates; pure geometry is exact
within floating-point arithmetic; graph normalization is an explicit policy.
Separate identity quantization, positional tolerance, and angle tolerance.

### A9 — P2: unnecessary parsing/allocation and queue shifting in hot paths

Source: `findNearestEdge`, `getClosestNodeToPoint`, `getConnectedComponents`,
and [`nearestPointOnSegments`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/utils/projection.ts).
Related: [#4](https://github.com/alexbol99/spatial-graph/issues/4),
[#10](https://github.com/alexbol99/spatial-graph/issues/10).

Nearest queries are linear scans; nearest-edge querying materializes all
Flatten segments. Components use `queue.shift()` and repeatedly convert points
back to keys. Algorithms commonly parse coordinate strings.

The existing nearest-point helper avoids Flatten objects, but is **not literally
allocation-free**: it allocates tuples and result objects per candidate. Its
JSDoc and issue #4 overstate this property. Reusing it is still a plausible
optimization, but the claimed speedup needs measurement.

Recommendation: traverse internal records/keys; use a head-index queue; compute
candidate distances without constructing public snapshots; materialize only
the winner. Use the selected RBush index when measurements justify adding it
to the runtime path. Keep this exact scan as a correctness reference.

### A10 — P2: subgraph extraction loses data and policy

Source: `getSubgraph`, `union`, and copy methods.
Related: [#10](https://github.com/alexbol99/spatial-graph/issues/10),
[#15](https://github.com/alexbol99/spatial-graph/issues/15).

Probe: extracting a selected edge loses its endpoint's `{label: 'start'}` and
the graph's `{label: 'network'}` attributes. This loss is documented for node
attributes; graph attributes are also not copied. A new subgraph always uses
default constructor options. Adding configurable precision without changing
this would compound the problem. Union already has a useful documented
destination-wins policy, but uses raw Graphology keys and permits shallow sharing.

Recommendation: extraction and all copies preserve coordinate policy and copy
graph/node/edge attributes according to one documented ownership policy.

### A11 — P2: public surface contains application assumptions and hidden policies

Source: [`index.ts`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/index.ts), [`constants.ts`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/constants.ts),
[`types.ts`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/types.ts), and `splitEdge`.
Related: [#6](https://github.com/alexbol99/spatial-graph/issues/6).

On the audited 1.0.1 baseline, root wildcard exports expose every utility and
constant. `calculatedMovement` uses a fixed minimum movement distance of 8.
`width`, `clearanceWidth`, `radius`, and `closestGeoms` are built into attribute
types. `IntersectionResult` and `SIMPLE_SEGMENT_COORDS` are unused. Additionally,
splitting rewrites a user attribute named `id` into a coordinate-pair string
when the old ID is truthy; this is an application policy hidden in otherwise
generic metadata handling.

**1.1.0 update:** [PR #19](https://github.com/alexbol99/spatial-graph/pull/19)
replaced root wildcards with an explicit export list containing `SpatialGraph`
and seven package-owned types. It removed the app-specific typed fields, unused
types/constants, and public geometry-helper exports. This resolves the export
surface portion of [#6](https://github.com/alexbol99/spatial-graph/issues/6),
which is now closed. `calculatedMovement`, its internal constant, and the split
`id` rewrite remain in the class; they are still 2.0 design work. The consumer
imports none of the removed helper exports, but it reads `edge.width` as a typed
field and needs its own attribute type in 2.0 (inventory section 4).

Recommendation: explicit exports; generic attributes; caller-owned metadata;
operation-specific attribute callbacks where needed. Keep genuinely generic
geometry utilities. `getLongestEdgeInPath` is itself domain-neutral and should
be evaluated on correctness/usefulness rather than removed solely because #6
lists it.

### A12 — P2/features: geometric and interoperability gaps are real

Source: `normalizeSegments`, intersection helpers, and examples.
Related: [#7](https://github.com/alexbol99/spatial-graph/issues/7),
[#14](https://github.com/alexbol99/spatial-graph/issues/14).

Probe: collinear overlapping edges return no single intersection. A Multiline
containing one segment and one arc adds just the segment without reporting the
unsupported arc. There is no built-in planarization, proximity merging, face
extraction, or GeoJSON adapter. The manual planarization example checks pairs
quadratically. README descriptions of nearby-node merging exceed the automatic
capabilities currently provided.

Recommendation: reject unsupported curve shapes now; distinguish no crossing,
point crossing, and segment overlap; implement planarization and nearby merging
as separate features after the coordinate/mutation contracts are sound.

### A13 — P2: validation coverage should grow around actual invariants

Source: [`src/__tests__`](https://github.com/alexbol99/spatial-graph/blob/6aefd1fda1c0065b16ff3b87473590a6a0386a0b/src/__tests__),
[`ci.yml`](../.github/workflows/ci.yml), and
[`publish.yml`](../.github/workflows/publish.yml).
Related: [#13](https://github.com/alexbol99/spatial-graph/issues/13).

The current suite covers many examples and several important edge cases, but
does not establish comprehensive movement-conflict, raw-import, precision,
attribute-ownership, and topology invariants. The release workflow runs the
four main checks but omits `check:examples`, which CI does run. CI's Node 22/24
matrix and package checks do not establish browser execution support or every
Node 22 patch version's ability to run TypeScript examples directly.

Recommendation: targeted regression tests for findings above, then property
tests with constrained generators and reproducible seeds;
run `check:examples` before publishing. Preserve the distinction between library
runtime requirements and development/example runner requirements.

### A14 — P1: some angle queries use lookup coordinates instead of stored ones

Source: `hasOrthogonalEdges` and `getNeighborsByLeftTurn`.
Related: [#15](https://github.com/alexbol99/spatial-graph/issues/15).

These methods find the node by its rounded key but construct direction vectors
from the original caller coordinates. Probe: a right-angle node at `[0, 0]`
returns `true` for `hasOrthogonalEdges([0, 0], 0)` but `false` for
`hasOrthogonalEdges([0.49, 0.49], 0)`, despite both inputs resolving to the same
key. The calculation describes a different center from the stored graph node.

Recommendation: resolve membership once, then use stored canonical coordinates
for all graph-element geometry. Keep arbitrary-point geometry in pure helpers.

## 4. Target data model

### 4.1 Geometry values and graph elements

Keep lightweight tuples, but give them names that do not imply membership:

```ts
export type Point2D = readonly [x: number, y: number];
export type Segment2D = readonly [start: Point2D, end: Point2D];

export type NodeType =
  | 'isolated'
  | 'stub'
  | 'intermediate'
  | 'corner'
  | 'junction';

export interface NodeAttributes {
  label?: string;
  [name: string]: unknown;
}

export interface EdgeAttributes {
  label?: string;
  [name: string]: unknown;
}
```

Rename `NxPoint`/`NxEdge` directly in the coordinated migration. A temporary
consumer-local adapter can ease staging, but old aliases need not ship in 2.0.
`NxEdge` currently represents any endpoint pair, so its successor `Segment2D`
works for geometry unrelated to a graph.

User metadata is generic (`N extends object`, `E extends object`) with the above
defaults. Do not require every user-defined interface to declare an index
signature. Keep mandatory internal geometry fields separate from these generic
types. Weight is not a mandatory library attribute.

### 4.2 Snapshot classes

These snapshot surfaces are implemented in `SpatialNode.ts` and `SpatialEdge.ts`.
Materializers use a nonexported symbol; construction without it throws. Callers
obtain snapshots through graph queries rather than constructing them directly.

```ts
export declare class SpatialNode<N extends object = NodeAttributes> {
  readonly key: string;
  readonly point: Point2D;
  readonly degree: number;
  readonly type: NodeType;
  readonly attributes: Readonly<N>;

  equals(other: SpatialNode<N>): boolean;
  distanceTo(other: SpatialNode<N>): number;
  toFlattenPoint(): Point;
}

export declare class SpatialEdge<
  N extends object = NodeAttributes,
  E extends object = EdgeAttributes,
> {
  readonly key: string;
  readonly source: SpatialNode<N>;
  readonly target: SpatialNode<N>;
  readonly endpoints: Segment2D;
  readonly attributes: Readonly<E>;

  get midpoint(): Point2D;
  get length(): number;
  equals(other: SpatialEdge<N, E>): boolean;
  toFlattenSegment(): Segment;
}
```

Node snapshots contain canonical stored coordinates, degree, classification,
and copied top-level attributes from one graph revision. Edge endpoint snapshots
come from that same revision. Source/target are an orientation for access, not a
direction of travel; graph edges remain undirected.

No graph pointer, dynamic topology getters, `exists` property, lifetime ID, or
tracking of moves. A snapshot remains readable after deletion. It does not
become a live object or throw because the graph changed. Calling `getNode(old)`
after deletion returns `null` unless a new node occupies that coordinate key.

Use fresh copied coordinate tuples and freeze their contents at runtime, not
only `readonly` declarations. Copy and shallow-freeze attribute dictionaries.
Nested user objects remain shared under the existing shallow-copy convention;
do not claim a deep historical snapshot. Provide an explicit attribute-cloning
hook if the consuming project needs nested isolation. Avoid unconditional
`structuredClone` because arbitrary user metadata may not be cloneable.

Snapshot properties cannot mutate the graph; all updates go through
`SpatialGraph`. Do not cache snapshots across graph revisions. Internally, eager
collection materialization should share endpoint snapshots within a single
query to avoid repeated classification work.

### 4.3 Equality and distance

```ts
// Inside SpatialNode; graph-local canonical keys are already assigned.
equals(other: SpatialNode<N>): boolean {
  return this.key === other.key;
}

distanceTo(other: SpatialNode<N>): number {
  return distance(this.point, other.point); // shared geometry helper
}
```

Equality ignores metadata, classification, and JavaScript object identity.
Removing and recreating a node at the same canonical coordinates yields equal
snapshots, as agreed. Different retrievals need not satisfy `a === b`.
Cross-graph comparisons are outside this contract; no graph reference is needed
to guard them. Geometric distance works on retained snapshots after deletion.
It is Euclidean distance, distinct from a route's network length or cost.

For undirected edges, equality compares canonical endpoint keys in either
order, rather than potentially unstable generated Graphology edge keys. The
public `key` identifies storage/serialization; use `equals` for geometric edge
identity. Do not introduce a tolerance into equality: closeness is a separate
predicate, and distance-within-tolerance is not transitive.

### 4.4 Node classification

| Stored degree | Classification |
| --- | --- |
| 0 | `isolated` |
| 1 | `stub` |
| 2, with opposing collinear incident directions | `intermediate` |
| 2, with a bend | `corner` |
| 3 or more | `junction` |

Use vectors from the canonical node coordinates to its neighbors. For degree 2,
test the deviation from 180 degrees using `atan2(abs(cross), dot)` and a dedicated
`straightAngleToleranceDeg` option. Recommend a small default of `1e-7` degrees,
subject to fixtures from the consuming project. Do not reuse the existing
10-degree orthogonality tolerance for straightness. Validate finite tolerances
in `[0, 90)`; zero permits strict floating-point comparison without slack.

The original three labels do not describe isolated nodes and conflate straight
degree-2 nodes with corners. Recommend the five labels for precise cleanup and
rendering. If the application wants three visual categories, it can map
`intermediate` to its chosen category and separately suppress isolated nodes.

Classification is derived from topology/geometry; it is not stored in user
attributes. The internal graph disallows self-loops and parallel edges, so
degree and neighbor count agree for this purpose.

### 4.5 Midpoint and length

`edge.midpoint` is the arithmetic mean of canonical endpoints; `edge.length`
uses `Math.hypot(dx, dy)`. Neither rounds the result to the insertion grid.
For edge `[0, 0] -> [1, 0]`, midpoint is `[0.5, 0]` even with integer insertion
precision. The midpoint need not have a graph node.

Graph conveniences resolve membership in the current graph:

```ts
graph.getNodeType(node);      // NodeType | null
graph.getEdgeMidpoint(edge);  // Point2D | null
graph.getEdgeLength(edge);    // number | null
```

`node.type` and `edge.length` describe their snapshots. The graph methods
resolve the input's key/endpoints and describe current members; they return
`null` if absent. This difference is intentional and must be in the JSDoc.

## 5. Graphology architecture and ownership

### 5.1 Recommended: private Graphology graph

`SpatialGraph` remains built on Graphology but no longer subclasses it. Maintain
one internal Graphology graph with records conceptually shaped as:

```ts
interface StoredNode<N extends object> {
  x: number;
  y: number;
  data: N;
}

interface StoredEdge<E extends object> {
  data: E;
}
```

Coordinates and edge length are library-owned; user attributes are the nested
`data` field. Point keys are generated from canonical `x/y`, never parsed during
routine algorithms. Length can initially be computed; if cached later, the
mutation boundary is responsible for updating it. Require undirected, simple,
loop-free storage. User attributes named `x`, `type`, `length`, or `id` remain
ordinary data without silently overwriting geometry.

Graphology supplies adjacency and attributes. The internal routing module now
delegates Dijkstra and reopening A* to `graphology-shortest-path` 2.1.0 and adapts
its node-key results into spatial paths. Costs and heuristics are validated before
search. The custom search engine is removed; the local heap serves RBush search.
Closed edges are removed from a temporary copy because upstream weight getters
coerce null to a default weight. Default routing needs no exported graph copy. The
snapshot classes remain independent of Graphology. They need not extend its
`Attributes`; internal record types satisfy that constraint structurally.

Connected components likewise call `graphology-components` 1.5.4 directly on
private adjacency and materialize its DFS-ordered keys as spatial snapshots.
There is no local component search or detached export. Chain/cycle decomposition
remains local because it partitions edges into maximal degree-2 walks rather
than enumerating simple paths between endpoints.

`bfs`, `bfsFromNode`, `dfs`, and `dfsFromNode` delegate to
`graphology-traversal` 0.3.1 on private adjacency. Visitors receive a
`SpatialNode` snapshot and depth; they cannot mutate the graph or start a nested
traversal. Returning true skips expansion of that node, not the whole traversal.
Whole-graph methods visit all nodes, including isolated ones; from-node methods
make no visits for a missing start. BFS depth counts traversal hops; DFS depth is
discovery depth. Direction-mode options are omitted for undirected storage.

Expose detached interoperability methods when a caller needs a separate graph:

- `toGraphology()` returns a new Graphology graph, with top-level `x/y` for
  renderers, a geometric `length`, and nested `data` metadata. It is not the
  internal mutable graph.
- `SpatialGraph.fromGraphology(graph, options)` validates and imports a detached
  copy; an optional attribute-mapping callback adapts existing flat dictionaries.
- Reject directed, multi, self-loop, inconsistent-coordinate, and non-finite
  inputs with actionable errors. Do not partially import them.

Ordinary Dijkstra/A* routes without closed edges call the private Graphology
instance directly. Closed-edge queries use a filtered copy; virtual projection
routes use a copy with temporary nodes and links. Both copy cases add O(V+E)
time and space before search, leave live storage/indexes/revision unchanged,
and require no public `toGraphology()` export. Public
cost/heuristic callbacks receive snapshots during validation; adjacency search
itself uses internal keys. A detached `toGraphology()` copy costs O(V + E) and
becomes stale after a mutation. It is an interoperability/serialization boundary,
not a prerequisite for every Graphology algorithm. If direct external access
becomes a measured requirement, decide on a controlled read-only view or an
explicitly documented mutable escape hatch and its index-invalidation semantics.
The inventoried consumer passes no graph to external Graphology algorithms and
uses no Graphology events, so Phase 1 does not need such an escape hatch.

The consumer already calls its own persistence serializer `toGraphology()`.
That method produces its application-specific `CirculationGraphology` JSON,
with `coords` and `corridor_width`. Rename that consumer serializer (for example,
`toStoredSkeleton`) during migration so it cannot be confused with a detached
Graphology instance returned by the proposed library method.

### 5.2 Alternative: retain inheritance

This preserves direct Graphology compatibility and inherited events at less
immediate consumer migration cost. `getNode(point)` is currently an available
name, but `addNode`, `hasNode`, `getNodeAttributes`, `mergeNodeAttributes`,
`addEdge`, and many other names already have raw key-based contracts.

If retaining inheritance, use consistent spatial names such as `addNodeAt`,
`hasNodeAt`, `getNodeAttributesAt`, and `addEdgeBetween`. Do not silently replace
the inherited contracts or build ambiguous point-versus-key overloads.

This alternative also requires handling every inherited insertion/import/
attribute-update method, invalid keys, loop policy, copy options, and event-based
index invalidation. Returning immutable snapshots does not solve those bypasses.
Composition is the selected approach. The
[consumer inventory](consumer-inventory.md) identifies the raw calls, the
consumer subclass, and protected helpers that Phase 1 must replace.

### 5.3 Copies and subgraphs

Keep familiar `copy()`, `emptyCopy()`, and `nullCopy()` spatial operations.
Preserve precision, tolerances, graph metadata, keys, and the chosen shallow
attribute ownership policy. `emptyCopy` keeps nodes; `nullCopy` keeps only graph
metadata/options. Return `SpatialGraph` in every case.

`getSubgraph(predicate)` should be explicitly edge-induced: copy selected edges,
their endpoints and metadata, plus graph options/metadata. Isolated nodes are
omitted unless requested separately. Return a new graph without shared top-level
attribute dictionaries. Preserve issue #8's fixed behavior throughout the
architecture change rather than treating copies as unfinished work.

## 6. Coordinates, precision, and exact geometry

Recommend `coordinatePrecision: number | null`, with `null` meaning preserve
finite input coordinates. The implemented 2.0 default is `null`; a company
project relying on the old integer grid must explicitly select `0`. The
[consumer inventory](consumer-inventory.md), section 8, confirms that the
company application is such a project: stored node/corridor keys and editor
equality depend on whole-unit coordinates. Real producer coordinates were not
sampled.

Decimal precision quantizes insertion/lookup points using one graph-local
normalizer. Validate an integer range (`0..15`) and reject coordinates
whose scaled normalization becomes non-finite or cannot meet the documented
precision contract. Normalize negative zero. JavaScript doubles remain the
numeric model; decimal precision does not guarantee exact decimal arithmetic.

Use one `getNodeKey(point)` function to produce keys from canonical coordinates.
Use the same policy for insertions, lookups, moves, import, and graph factories.
Do not reimplement key formatting at call sites. Pure conversions and geometry
helpers must not depend on an instance or a global constant.

Separate three concepts:

| Concept | Meaning | Affects equality? |
| --- | --- | --- |
| Coordinate precision | Optional quantization of stored nodes | Yes, through canonical keys |
| Position tolerance | Geometric containment/nearby-node operations, in graph units | No |
| Angle tolerance | Straightness/orthogonality, in degrees | No |

Grid rounding is not distance-based clustering. Nearby-node merging is an
explicit operation with a deterministic representative and conflict policy.
Geometry is planar Cartesian; GeoJSON does not introduce geodesic calculations.

There is a real incompatibility between strict fixed-grid coordinates and exact
noding at every arbitrary crossing. A crossing may not lie on the configured
grid. Do not hide this by rounding the crossing and claiming planarization.
Under quantization, report/reject crossings that cannot be inserted while
remaining on both edges within the positional tolerance; an explicit
reshape/snapping operation may accept displacement. Exact-coordinate mode
avoids that specific restriction but still requires numerical tolerances.

Remove `COORDINATE_PRECISION` as global mutable policy. Conversion helpers such
as `fromFlattenPoint` should return exact coordinate tuples. Offer explicit
`quantizePoint(point, precision)` if callers need pure quantization.

## 7. Proposed public API and migration

### 7.1 Inputs, queries, and result shapes

```ts
export type NodeInput<N extends object = NodeAttributes> =
  | Point2D
  | SpatialNode<N>;

export type EdgeInput<
  N extends object = NodeAttributes,
  E extends object = EdgeAttributes,
> = Segment2D | SpatialEdge<N, E>;

export interface NearestEdgeResult<
  N extends object = NodeAttributes,
  E extends object = EdgeAttributes,
> {
  readonly edge: SpatialEdge<N, E>;
  readonly point: Point2D;
  readonly distance: number;
  readonly t: number;
  readonly clamped: boolean;
}

export interface SpatialPath<
  N extends object = NodeAttributes,
  E extends object = EdgeAttributes,
> {
  readonly nodes: readonly SpatialNode<N>[];
  readonly edges: readonly SpatialEdge<N, E>[];
  readonly length: number;
  readonly cost: number;
  readonly closed: boolean;
}
```

Primary methods accept coordinate tuples and snapshot references, not Flatten
objects or raw string keys. A snapshot input is resolved by its canonical
coordinates/endpoints under the current graph's policy; it does not prove that
the element still exists. Operate only within the same graph/coordinate policy.
Geometry-only helpers accept `Point2D`/`Segment2D`; explicit Flatten adapters
handle integrations. Do not pass graph snapshots to helpers merely to avoid
writing `.point` or `.endpoints`.

Illustrative `SpatialGraph<N, E>` query signatures:

```ts
getNode(node: NodeInput<N>): SpatialNode<N> | null;
getEdge(edge: EdgeInput<N, E>): SpatialEdge<N, E> | null;
getEdgeBetween(a: NodeInput<N>, b: NodeInput<N>): SpatialEdge<N, E> | null;
getNodes(): SpatialNode<N>[];
getEdges(): SpatialEdge<N, E>[];
getNodePoints(): Point2D[];
getEdgeSegments(): Segment2D[];
getNeighbors(node: NodeInput<N>): SpatialNode<N>[];
getNodeType(node: NodeInput<N>): NodeType | null;
getNodeDegree(node: NodeInput<N>): number | null;
getEdgeMidpoint(edge: EdgeInput<N, E>): Point2D | null;
getEdgeLength(edge: EdgeInput<N, E>): number | null;
findNearestNode(point: Point2D): SpatialNode<N> | null;
findNearestEdge(point: Point2D): NearestEdgeResult<N, E> | null;
getConnectedComponents(): SpatialNode<N>[][];
findPaths(): SpatialPath<N, E>[];
findTerminalPaths(subset?: readonly NodeInput<N>[]): SpatialPath<N, E>[];
getShortestPath(a: NodeInput<N>, b: NodeInput<N>, options?: PathOptions<N, E>)
  : SpatialPath<N, E> | null;
```

Nearest results use exact coordinates and retain `t` and `clamped` semantics
from the existing nearest-point helper. `t` is measured from the returned edge's
source to target, with endpoints 0 and 1. An exactly perpendicular foot at an
endpoint is not marked clamped; a foot outside the segment is clamped, subject
to a documented numerical slack. Resolve ties by existing insertion order for
the initial implementation and preserve that rule in indexed queries.

`getNodes`, `getEdges`, neighbors, components, classifications, graph paths,
and nearest graph members return elements. Pure projection, midpoint,
intersection, and polyline simplification return geometry. For Flatten objects,
offer `getFlattenPoints`, `getFlattenSegments`, and element conversion methods.

### 7.2 Naming and migration table

This covers the methods declared by `SpatialGraph` on the audited baseline.
The completed [consumer inventory](consumer-inventory.md), section 3.2, lists
the inherited Graphology methods that need destinations because composition
removes their automatic availability.

| 1.x method | Implemented 2.0 replacement / disposition |
| --- | --- |
| Constructor `{segments, attrs, allowSelfLoops}` | `{coordinatePrecision, positionTolerance, straightAngleToleranceDeg}` plus explicit `addEdges` insertion; no constructor segment overload or loop allowance |
| `addVertex(point, attrs)` | `addNode(point, attrs)`; returns a snapshot; existing node merges metadata |
| `addSegment(segment, attrs)` | Primary `addEdge(segmentTuple, attrs)`; explicit `addFlattenSegment` adapter |
| `addSegments(segments, attrs)` | `addEdges([{endpoints, attributes}, ...])`; explicit Flatten batch adapter; stop using parallel arrays |
| `hasPointNode(point)` | `hasNode(node)` |
| `getPointKey(point)` | `getNodeKey(point)` |
| `getEdgeKeyFor(edge)` | `getEdge(edge)?.key ?? null` |
| `getEdgeBetweenPoints(a, b)` | `getEdgeBetween(a, b)`; returns `SpatialEdge` |
| `getPointDegree(point)` | `getNodeDegree(node)`; missing returns `null`; snapshot `.degree` |
| `getPointNeighbors(point)` | `getNeighbors(node)`; returns `SpatialNode[]` |
| `getPointAttributes(point)` | `getNodeAttributes(node)`; missing returns `null` |
| `mergePointAttributes(point, attrs)` | `mergeNodeAttributes(node, attrs)` only updates existing nodes; explicit `addNode` performs upsert |
| `getEdgeAttributesFor(edge)` | `getEdgeAttributes(edge)`; missing returns `null` |
| `mergeEdgePointAttributes(edge, attrs)` | `mergeEdgeAttributes(edge, attrs)` |
| `removePoint`, `removePoints` | `removeNode`, `removeNodes`; snapshots or tuples accepted |
| `removeEdge`, `removeEdges` | Keep names; snapshots or endpoint tuples accepted |
| `removeSegment(segment)` | `removeFlattenSegment(segment)` adapter; primary `removeEdge` |
| `getNodes`, `getEdges` | Keep names; return snapshot classes |
| `getVertices()` | `getFlattenPoints()`; tuple extraction is `getNodePoints()` |
| `getSegments()` | `getFlattenSegments()`; tuple extraction is `getEdgeSegments()` |
| `getJunctions`, `getStubs` | Keep names; return `SpatialNode[]`; `getNodesByType(type)` is available |
| `isStub(point)` | `getNodeType(node) === 'stub'` |
| `hasOrthogonalEdges`, `getNodesWithOrthogonalEdges` | Keep names; inputs/results use nodes; canonical coordinates and validated angle tolerance |
| `findNearestEdge(point)` | Structured exact nearest result or `null`, rather than Flatten segment/empty-graph throw |
| `getClosestNodeToPoint(point)` | `findNearestNode(point)`; returns node or `null` |
| `projectPointOnClosestEdge(point)` | Consolidate into `findNearestEdge(point)` result; no separate snapped tuple result |
| `getShortestPath(start, end)` | `SpatialPath` with nodes, edges, geometric length, and cost, or `null` |
| `getSubgraph(attrName, value)` | `getSubgraph(edgePredicate, options?)`; preserves options and metadata |
| `getFilteredNodes(predicate)` | `getNodes().filter(predicate)` initially; optional `filterNodes(predicate)` only if allocation warrants it |
| `moveNode`, `moveNodes` | Keep names; `NodeInput`; transactional remove/recreate semantics; return movement report |
| `collapsePointInto(source, target)` | `mergeNodeInto(source, target)`; shared conflict policy |
| `removeStubPoint(point)` | `removeStubNode(node)` |
| `removeDegree2PointAndJoin(point)` | Safe `joinNode(node)`; deliberate bend/cycle changes use `collapseDegree2Node` |
| `splitEdge(edge, point)` | Keep name; validate containment before mutation; return split report |
| `getEdgeWeight(edge)` | Remove overloaded length meaning; `getEdgeLength` or user `attributes.weight`/cost callback |
| `getLongestEdgeInPath(path)` | `getLongestEdge(path)` over `SpatialPath`, returning an actual edge or `null` |
| `getPathLength(points)` | `getPathLength(nodeInputs)` returns `null` for an invalid graph path; path result `.length` preferred |
| `calculatedMovement(path, line)` | Move to application code; retain generic projection helpers if independently useful |
| `findPaths()` | Structured paths; preserve every-edge-once decomposition and closed cycles |
| `findIsolatedPaths(subset)` | `findTerminalPaths(subset)`; degree measured within the induced subset |
| `union(other)` | Keep name; validate coordinate policy, preserve metadata, return merge report |
| Node/edge label getters/setters | Keep names with element inputs; getter `null` for missing/unlabeled; setters report missing without creating |
| `getConnectedComponents()` | Keep name; snapshot groups from `graphology-components` DFS on private adjacency |
| `getNeighborsByLeftTurn(node, incoming)` | Keep with explicit `Vector2D` incoming direction, canonical node coordinates; not a point representing the prior node |
| `createCompleteGraph(points, callback)` | `fromPoints(points, {connect, ...options})`; graph-local normalization; callback over canonical points |
| `copy`, `emptyCopy`, `nullCopy` | Keep spatial copy contracts, policy/metadata preserved |

Raw migration examples under composition:

| Inherited usage today | Target |
| --- | --- |
| `graph.nodes()` / `graph.edges()` | `getNodes().map(n => n.key)` / `getEdges().map(e => e.key)` |
| `graph.degree(key)` | `getNode(point)?.degree` or `getNodeDegree(node)` |
| `graph.addNode(key, attrs)` | `addNode(point, attrs)` |
| `graph.dropNode(key)` / `dropEdge(key)` | Spatial removal through coordinates/snapshots |
| `getNodeAttributes(key)` / `getEdgeAttributes(key)` | Typed spatial attribute methods |
| `setAttribute`, `getAttributes` | Explicit graph-metadata methods, copied dictionaries |
| `export()` / `import()` | Validated spatial serialization described in section 10 |
| `graph.on(...)` | Controlled spatial mutation events if actually used; otherwise reread after operation |
| Passing `graph` into a Graphology algorithm | Built-in operation or detached `toGraphology()` |
| `graph instanceof Graph` | No longer true; remove assumption or check the adapter |

Phase 0 identified four gaps in these destinations. Add `nodeCount` and
`edgeCount` (migrating Graphology `order`/`size`), explicit
`getGraphAttribute`/`setGraphAttribute` for persisted label counters,
`getNodeByKey(key)` with strict canonical-key validation for stored references,
and `clear()` as a spatial mutation if the unused beautify path is retained.
These Phase 1 APIs are now implemented. The consumer uses
`forEachNode`/`forEachEdge` and raw attribute methods for IDs and width updates;
migrate them to snapshot iteration and spatial attribute operations. It does
not pass `SpatialGraph` to Graphology algorithms or use Graphology events,
`export()`/`import()`, or `instanceof Graph`.

### 7.3 Missing values and errors

| Situation | Contract |
| --- | --- |
| Node/edge lookup misses | `null` |
| Single-value query needs a missing member | `null` |
| Neighbor/collection query has no results | `[]` |
| Membership predicate | `false` |
| Removal of a missing member | `false` or a report with `changed: false` |
| Routing missing/disconnected endpoints | `null` |
| Routing from an existing node to itself | Valid zero-cost path with one node and no edges |
| Nearest query on an empty graph | `null` |
| Move from a missing source | Throw before any mutation, preserving the existing intent |
| Non-finite coordinates, invalid options, off-edge split | Throw actionable error before mutation |
| Duplicate/collapsed insertion | Report a normal no-op, not an invalid-input exception |

Do not use zero for a missing length/degree, or an empty attribute dictionary
for a missing member; those values can be legitimate. Every public method gets
JSDoc covering its missing case and errors. Graph snapshots never independently
check membership; graph operations do.

### 7.4 Intended usage

```ts
const graph = new SpatialGraph({coordinatePrecision: null});
graph.addEdge([[0, 0], [10, 0]], {label: 'link'});
graph.addEdge([[10, 0], [10, 10]], {});

const node = graph.getNode([10, 0]);
node?.type;                         // 'corner'
node?.distanceTo(graph.getNode([0, 0])!); // 10

const edge = graph.getEdgeBetween([0, 0], [10, 0]);
edge?.midpoint;                     // [5, 0], no node required there
edge?.length;                       // 10

if (node) {
  graph.moveNode(node, [12, 0]);
  node.point;                      // retained snapshot: [10, 0]
  graph.getNode([10, 0]);           // null
  graph.getNode([12, 0]);           // new snapshot
}
```

## 8. Mutation contracts and metadata policy

All operations go through an internal mutation planner/committer. Validate
inputs, resolve canonical keys, collect affected records, and determine conflict
outcomes before changing storage. Commit once; invalidate indexes/caches once;
return a report. Operations do not expose half-applied graphs through public
events. A bulk operation should be atomic for invalid inputs; normal insertion
skips are recorded rather than treated as partial failure.

### Insertion

`addNode` returns the resulting snapshot. Adding at an existing key merges
attributes according to the documented upsert policy. `addEdge` creates missing
endpoints, adds a valid nonzero edge, or reports an existing/collapsed edge.
An edge insertion report should identify `added`, `existing`, or `collapsed`,
the edge if any, and canonical endpoints. Batch reports retain each input index
and reason; count added/existing/collapsed inputs separately.

Reject arcs and unsupported shapes in Flatten adapters before inserting any of
the batch. Use records instead of parallel geometry/attribute arrays. For
generic attributes with required fields, require them when creating records or
require a configured default-attribute factory; do not pretend `{}` satisfies
every `N`/`E` through a cast.

### Moving and merging

- A move to the same canonical point is a reported no-op.
- Snapshot all source nodes and touching edges before removing anything.
- Swaps and chains resolve against the original graph state.
- Reject multiple different destinations for the same source; deduplicate
  identical repeated moves.
- Remove old source nodes; recreate destination nodes or merge into existing
  ones. Old snapshot objects remain readable, and their keys do not change.
- Recreate edges using moved endpoints; report self-loop collapses and duplicate
  edges rather than silently discarding them.
- Existing destination metadata wins conflicts by default. Where no stationary
  destination exists, process sources in canonical key order, with the lowest
  source key winning conflicting fields; merge nonconflicting fields.
- Apply the same deterministic rule to duplicate edges, using canonical original
  endpoint-pair identity. Expose conflict callbacks for application overrides.
- Call conflict callbacks on copied inputs during planning. The order-independent
  default does not promise independence for arbitrary stateful callbacks.

`mergeNodeInto` uses that policy. `union` keeps existing destination metadata by
default. Reject mismatched precision/policy in union unless an explicit
renormalization option is supplied with a collision report.

### Splitting

Resolve the actual stored edge and validate the exact proposed point against
its segment. Resolve the insertion policy and validate the resulting canonical
point again. Missing edge and endpoint split are documented no-ops. Off-edge
points throw before deleting the original edge. A report identifies the split
node, removed edge, replacement edges, and any reuse/conflicts.

Copy user metadata to both pieces by default; do not reinterpret `id`. A
`splitAttributes` callback can assign application IDs or redistribute metadata.
Geometric length follows the new endpoints. User fixed penalties/costs are not
automatically additive; custom routing cost semantics must account for splitting.

If replacement edges already exist, apply the shared conflict policy. Ensure
this planning step happens before dropping the old edge. Serialization and
undo must describe the actual committed result, not assumed new edge identities.

### Joining and cleanup

`joinNode` requires a straight degree-2 node, two distinct neighbors, and no
existing neighbor-to-neighbor edge. Otherwise report a no-op with a reason.
It preserves geometry/topology within configured tolerances. Provide a
`joinAttributes` callback for metadata reconciliation; the default follows the
deterministic merge policy and documents which metadata cannot be preserved.

`collapseDegree2Node` may remove a bend or collapse a triangle; expose it only
as an explicitly destructive geometric operation. Library helpers should not
repeat the current blanket “pass-through” description for bent nodes.

## 9. Algorithms, performance, and feature boundaries

### Routing

Return `SpatialPath` immediately for ordinary length-based shortest paths.
Default cost is geometric edge length, computed from storage, not a mutable
`weight` field. Add a cost callback `(edge) => number | null`; `null` closes an
edge, finite nonnegative numbers set cost. Zero is valid. Validate all relevant
costs before search or through an algorithm path that guarantees invalid costs
are rejected; do not rely on undocumented behavior of Graphology's Dijkstra.

Add A* only with an explicit heuristic contract: finite, nonnegative, admissible
for optimality, and zero at the destination. For arbitrary user costs, default
to zero heuristic. Euclidean distance is admissible for geometric-length routing
but can overestimate a different cost model. Document whether the chosen A*
implementation also requires consistency or supports reopening nodes. Differential
tests compare results with Dijkstra.

Implemented option shape (Dijkstra and reopening A* are both supported):

```ts
export interface PathOptions<
  N extends object = NodeAttributes,
  E extends object = EdgeAttributes,
> {
  algorithm?: PathAlgorithm;
  cost?: (edge: SpatialEdge<N, E>) => number | null;
  heuristic?: (node: SpatialNode<N>, goal: SpatialNode<N>) => number;
}
```

Export `PathAlgorithm.Dijkstra` and `PathAlgorithm.AStar`; Graphology supplies no
algorithm enum. Reject unknown algorithms and heuristics supplied without
`algorithm: PathAlgorithm.AStar`. Resolve cost/heuristic
callback views consistently for one graph revision, and avoid allowing callbacks
to mutate the graph during routing.

Path edges have undirected snapshots; `path.nodes` supplies traversal order.
Compute `length` independently from `cost`; closed-edge behavior, no-route,
same-node, and equal-cost tie cases must be tested. Path decomposition is not
shortest-path routing; preserve pure cycles and every-edge-once coverage.

The implemented `route(fromPoint, toPoint)` virtually attaches exact projected endpoints
without mutating the graph. Its result must include traversal geometry because
an endpoint inside an edge is not a `SpatialNode`. Do not fabricate member-node
snapshots or reuse `SpatialPath.nodes` to represent virtual points. Handle the
same-edge case, source/destination projection ties, maximum snap distance, and
endpoint attachment explicitly.

Begin virtual routing with geometric-length cost. Arbitrary costs on partial
edges need a traversal callback with edge, `fromT`, `toT`, and direction;
proportional scaling is not valid for fixed penalties or all user costs. Define
that contract before extending virtual routes to custom costs.

### Nearest queries and indexing

First implement an exact scan over internal coordinates, avoiding Flatten and
snapshot creation for losing candidates. Store coordinates once and traverse keys
internally. Connected components now delegate to Graphology DFS instead of a local queue.

**Decision: use RBush as the private mutable spatial index for SpatialGraph.**
It indexes node points and edge bounding boxes; exact geometry determines the
nearest result. Both RBush and the suite's interval tree allow incremental
updates. The earlier performance experiments informed the RBush decision, but
benchmark files and tooling have moved to a separate local repository at the
owner's request. They are outside this package's implementation and CI scope.

Keep RBush indexes private and derived from the authoritative graph records:
index node points and edge bounding boxes with keys from those records. Maintain
entries incrementally on ordinary geometry edits; bulk-load or rebuild after
large imports when measurements justify it. Keep the exact scan as a reference
and fallback. Add RBush as a runtime dependency when the index is integrated.
Keep candidate selection separate from exact nearest-on-segment evaluation.
Use bounding-box distance lower bounds and a stopping rule, not an arbitrary
nearest-N box heuristic that could miss the real nearest segment.

Track topology/coordinate revisions separately from metadata if useful. Insert,
remove, move, split, merge, union, import, and clear must update the affected
RBush entries or rebuild the index; metadata-only updates do not affect it.
Indexed and scan results must agree, including tie rules. Materialize the
winning snapshot after the search.

### Planarization and overlaps

Define a geometry intersection result with discriminated `none`, `point`, and
`overlap` cases; keep graph membership out of this pure type. Handle crossings,
endpoint touches, T-junctions, equal segments, reversed segments, and collinear
partial overlap. Report exact geometric points before insertion policy is applied.

`planarize` collects candidate interactions, sorts split parameters for every
original edge, and applies one batch mutation. Decompose overlaps at their
boundaries and reconcile duplicate pieces via the shared metadata policy.
An index reduces candidate pairs but cannot guarantee subquadratic work for
all dense intersection outputs. Report unresolved quantization conflicts.

`mergeNearbyNodes(tolerance)` needs a specified clustering model. Recommend
connected components of the within-tolerance relation, deterministic existing
representatives, and a report of maximum displacement. Transitive clusters can
move members farther than the tolerance from the representative; document that
; a bounded-displacement strategy is not part of this implementation. It is not equivalent to
decimal rounding.

### Features deferred beyond this implementation

GeoJSON, A*, virtual routes, RBush indexes, planarization, and nearby merging
were originally staged after the core. They are now implemented and tested.
The following remain outside the agreed straight, undirected graph model:
- Directed/one-way graphs: require different edge identity, neighbor semantics,
  degree classification, and traversal/cost contracts; a separate design.
- Face extraction: distinguish graph cycles from planar faces, exterior face,
  holes, bridges, and orientation. Left-turn sorting alone is not a face API.
- Arc support: reject now; explicit approximation with a maximum error can be a
  later adapter. Native curves alter geometry, indexing, and routing contracts.
- A generated API reference can follow stable contracts; API groups and shipped
  JSDoc are provided now. Performance experiments remain outside this repository.

## 10. Serialization, adapters, exports, and dependencies

### Serialization

Provide `graph.export()` and `SpatialGraph.fromJSON(data)` with a versioned
spatial envelope. `graph.import(data)` may remain as a validated bulk operation
if the consumer needs it, with explicit replace/merge semantics. Store schema
version, graph options, graph attributes, explicit node coordinates/user data,
and edge endpoint keys/user data. Preserve edge keys where required for history
and application references. Classes are materialized views; do not serialize
their prototypes, degree/type caches, or graph pointers.

Legacy Graphology exports need an explicit import path: strictly parse the
entire coordinate key, validate finite values, apply an explicitly chosen legacy
precision policy, and report key collisions. Reject incompatible topology.
Recompute geometric length rather than trusting legacy weight. Preserve the
original weight as user data when requested; the default router ignores it.
Existing snapshots cannot be used to infer graph revision/history.

Serialization of arbitrary JavaScript attributes is not guaranteed to be JSON
lossless. Document JSON-compatible metadata or allow an encode/decode hook.
Validate the complete payload before modifying a live graph. Do not execute
user-provided serialized code or silently accept unknown future schema versions.

### GeoJSON

Implement `fromGeoJSON`/`toGeoJSON` as adapters, initially for LineString and
MultiLineString features, plus standalone Points. Reject unsupported geometries. Feature properties belong to user metadata;
attributes on split pieces need source-feature provenance rather than synthetic
application IDs. Reject non-finite coordinates and explicitly handle extra
dimensions (recommended initial behavior: reject, with an option to drop them).

Graph normalization may merge duplicate features; `onReport` receives the batch
insertion report, including existing and collapsed segments.
Keep fine coordinates by default. Export per-edge LineStrings initially;
merging chains with different metadata is an explicit option, not a default.
Explain Cartesian length regardless of the source coordinate reference system.

### Deliberate public exports

**Done in 1.1.0:** `src/index.ts` now explicitly exports `SpatialGraph` and
seven package-owned types; no root `export *` remains. For 2.0, extend that
deliberate list with snapshot classes, geometry values, and reviewed
operation/result types. Reintroduce a pure helper only when its public contract
and consumer need justify it. Keep internal storage, key formatting internals,
numerical constants, and index implementation private. Use `.js` extensions
under NodeNext as today.

The built-in application metadata fields, `SIMPLE_SEGMENT_COORDS`, unused
`IntersectionResult`, and public geometry-helper exports were removed in 1.1.0.
The 2.0 implementation removes `MIN_EDGE_MOVEMENT_DISTANCE`,
`calculatedMovement`, and the hidden split `id` rewrite. `splitAttributes` supplies
an explicit consumer policy instead. Review generic helpers individually rather than restoring
the entire old export surface. Classification thresholds need no global tuning
if the type contract defines them.

Retain the published `files` allowlist: `dist`, `README.md`, `llms.txt`, `LICENSE`.
This design document, tests, examples, and demo remain repository artifacts. Preserve ESM/CJS and both declaration formats unless separately decided.

### Dependencies and supported runtimes

Issue #12 reports Graphology 0.26 as excluded by the current `^0.25.4` range.
The original audit verified only the manifest. The redesign tests storage, edits,
routing, and adapters against Graphology 0.26.0, the current registry release
verified on 2026-10-10. The dependency range is `^0.26.0`; supporting the older
0.25 line adds no value for this controlled breaking migration. Keep
`graphology-types` aligned.
Do not claim a version upgrade fixes invariants by itself.

Under composition, keep Graphology an internal dependency initially; direct
`instanceof Graph` compatibility is no longer part of `SpatialGraph`. Detached
adapters need a clear contract about the dependency's Graph class identity.
Only make Graphology a peer if actual integrations need one shared instance;
avoid a gratuitous root re-export of its entire API. Retain Flatten as a peer
while explicit adapters and conversions use its objects.

Keep the current Node runtime support declaration for the core release unless
tests justify changing it. Browser support requires an import/runtime smoke
test; a neutral bundler target is insufficient evidence. Document a separate
minimum Node version for running raw TypeScript examples. Add `check:examples`
to release validation so it matches CI and `AGENTS.md`.

## 11. Disposition of the issues in the original audit

Twelve issues were open when this audit began on 2026-10-05. As of 2026-10-09,
eleven remain open (rechecked 2026-10-10): [#6](https://github.com/alexbol99/spatial-graph/issues/6)
closed after PR #19. The original core/follow-up staging is now superseded by the implementation
column below. This document does not
change issue status.

| Issue | Current relevance after the 2.0 redesign | Implementation / remaining scope |
| --- | --- | --- |
| [#4 — Spatial index and nearest-query speed](https://github.com/alexbol99/spatial-graph/issues/4) | Original scan/allocation problem addressed; candidate for closure after merge | Private mutable RBush indexes perform best-first nearest search with exact point/segment evaluation. Scan-reference and mutation differential tests cover correctness. Benchmarks remain in the owner's separate repository; no new 100k-edge timing claim is made. |
| [#5 — Custom cost, A*, arbitrary-point routing](https://github.com/alexbol99/spatial-graph/issues/5) | Main request addressed; directed/one-way edges remain relevant as a later feature | Length and user metadata are separate; Graphology Dijkstra/A*, custom nonnegative/zero/closed costs, structured cost/length results and nonmutating geometric virtual routes are implemented. Custom costs on partial edges are also deferred pending a traversal-cost contract. Neither extension gates 2.0. |
| [#6 — Application-specific/unused exports](https://github.com/alexbol99/spatial-graph/issues/6) | Already closed in 1.1.0 | Explicit exports, package-owned types and redundant helper removal landed in main. The redesign also removes hidden application policy and exposes explicit split metadata callbacks. |
| [#7 — Geometry gaps](https://github.com/alexbol99/spatial-graph/issues/7) | Overlaps, planarization, nearby merging and silent arc loss addressed; face extraction remains relevant | Index-assisted overlap/crossing/T-junction planarization and transitive proximity merging are implemented. Unsupported arcs throw before insertion, satisfying the issue's rejection alternative. `findPaths()` preserves edge-covering cycles but does not enumerate all cycles or extract planar faces. Faces/native curves remain independent future work. |
| [#9 — Off-edge split / missing weight](https://github.com/alexbol99/spatial-graph/issues/9) | Addressed; candidate for closure after merge | Split validates exact and canonical containment before mutation; geometric length is independent of user weight; missing edge length returns null. Regression tests cover rejected off-edge/grid-displaced splits and missing queries. |
| [#10 — Store coordinates / queue performance](https://github.com/alexbol99/spatial-graph/issues/10) | Original algorithm problem addressed; candidate for closure after merge | Stored canonical x/y replaces routine key parsing. Components use `graphology-components` DFS directly; BFS/DFS wrappers use `graphology-traversal`, not a local shifting queue. Key parsing remains only at explicit key lookup/legacy import boundaries. Renderer adapters expose x/y. Benchmarks are external by owner decision. |
| [#11 — Naming cleanup](https://github.com/alexbol99/spatial-graph/issues/11) | Addressed by the accepted major-version cutover; candidate for closure after merge | Consistent node/edge graph vocabulary, Point2D/Segment2D coordinate values, immutable snapshots and explicit Flatten adapters replace mixed legacy names. README/llms/examples/AGENTS document the breaking migration. The owner accepted direct removal instead of alias/deprecation staging. |
| [#12 — Dependencies / engines](https://github.com/alexbol99/spatial-graph/issues/12) | Original dependency concern addressed; older Node support is optional future scope | Graphology ^0.26.0 is installed and exercised by package probes. Composition removes the inherited-Graph `instanceof` premise; Graphology remains a private implementation dependency. Node 22+ is an explicit support policy, with CI configured for 22/24 and Chromium tested; widening runtime support is not required for 2.0. |
| [#13 — Property/performance tests](https://github.com/alexbol99/spatial-graph/issues/13) | Property-test request addressed; in-repo benchmark proposal superseded by owner decision | Seeded properties cover edge-once decomposition, component partitions, simultaneous moves, spatial JSON and indexed/reference nearest agreement. Split/join recovery has geometry and metadata-policy qualifications. Performance experiments live separately; do not reintroduce benchmark tooling or timing thresholds here. |
| [#14 — GeoJSON](https://github.com/alexbol99/spatial-graph/issues/14) | Addressed; candidate for closure after merge | Point/LineString/MultiLineString import, edge properties, line/isolated-point export, dimension policy and collapsed insertion reports are implemented and tested. Geometry is Cartesian. Optional chain-merging exports are not needed for the proposed basic adapter. |
| [#15 — Precision / silent segment drops](https://github.com/alexbol99/spatial-graph/issues/15) | Addressed by the accepted major version; candidate for closure after merge | Exact default, per-instance decimal precision and finite/quantization checks replace the global integer grid. Insertions return added/existing/collapsed reports. `mergeNearbyNodes` provides explicit tolerance clustering; it does not silently alter coordinate identity during insertion. |
| [#16 — Audit roadmap](https://github.com/alexbol99/spatial-graph/issues/16) | Tracking issue is stale; refresh it after merge | Core roadmap work is implemented in 2.0; its #6/#8 unchecked entries are already closed. Directed edges, planar faces/general cycle enumeration, native curves and optional generated API documentation remain future scope. Benchmarks stay external. Consumer migration may follow publication and is not a library release gate. |

### Release-readiness review of open issues (2026-10-10)

Read the current title/body of all eleven open issues, and separately verified
that #6 and #8 are closed and PR #17 remains open. The issue descriptions still
refer to the 1.0.0 architecture. The table distinguishes original findings from
behavior in this working tree; implemented work is not yet a released npm fix.
No GitHub issue, checkbox, comment, or PR state was changed by this review.

After the redesign merges, #4, #9, #10, #11, #14 and #15 can be closed against
its implementation and tests. #12 can be closed with the composition and
Node-support decisions recorded; #13 can be closed for the library scope with
its benchmark work explicitly assigned to the separate repository. Keep or split
#5/#7 for directed edges and planar faces/general cycle extraction, and refresh
#16 to distinguish completed 2.0 work from those later features. Native curve
support and generated API docs can be tracked separately if desired.

None of the reviewed open issues supplies an unmet requirement for the agreed
2.0 release. Deferred features are deliberate scope decisions, not release gates.
The owner has also confirmed that the company application can migrate against
the published package. Publication still needs committed/pushed changes and
successful CI/release validation.

Evidence lives in [SpatialGraph.ts](../src/SpatialGraph.ts), the private
[spatial index](../src/internal/spatialIndex.ts),
[routing adapter](../src/algorithms/routing.ts),
[geometry regressions](../src/__tests__/geometry.node.spec.ts),
[adapter regressions](../src/__tests__/adapters.node.spec.ts),
[algorithm regressions](../src/__tests__/algorithms.node.spec.ts),
[traversal regressions](../src/__tests__/traversal.node.spec.ts), and
[seeded invariants](../src/__tests__/invariants.node.spec.ts).

[Issue #8](https://github.com/alexbol99/spatial-graph/issues/8) is **closed** and
fixed in `main` through [PR #18](https://github.com/alexbol99/spatial-graph/pull/18).
The current copy tests pass. Its completed behavior is a regression requirement,
not a new unresolved finding, even though issue #16 still lists it unchecked.

[Open PR #17](https://github.com/alexbol99/spatial-graph/pull/17) adds an editor
demo on a separate branch. Only its description and changed-file inventory were
inspected here; its implementation was not audited. If merged, migrate its
hit-testing, selection, drag, split, and history code alongside the company's
consumer. The PR already notes the triangle/join behavior and guards against it.
Keep display width as demo/application metadata, and keep the demo outside the
published package. Undo/redo should serialize canonical state/options rather
than snapshot class instances.

## 12. Suggested implementation layout

```text
src/
  SpatialGraph.ts          public facade and operation orchestration
  SpatialNode.ts           immutable node snapshots; equality and distance
  SpatialEdge.ts           immutable edge snapshots; midpoint and length
  types.ts                public geometry, inputs, results, options
  index.ts                deliberate named exports
  internal/
    coordinates.ts        validation, canonicalization, key production
    storage.ts            private Graphology records and snapshot materializers
    mutations.ts          planning and deterministic conflict policy
    spatialIndex.ts       mutable node/edge RBush indexes and exact best-first search
    heap.ts               stable heap for nearest spatial search
    snapshotToken.ts      private materialization token
  algorithms/
    classification.ts     degree/angle classification
    traversal.ts          edge-covering chain/cycle decomposition
    nearest.ts            exact reference scan
    routing.ts            Graphology pathfinding adapter, results and costs
  adapters/
    flatten.ts            explicit geometry conversion/import
    graphology.ts         detached conversion and validated import
    serialization.ts      schema/version validation and legacy migration
    geojson.ts            validated Cartesian GeoJSON import/export
  utils/
    geometry.ts           exact geometry on tuples
    intersection.ts       crossings/overlaps
    projection.ts         exact nearest point and edge parameters
```

These are responsibility boundaries, not a requirement to create empty modules
before there is code to put in them. Split the current 1,272-line class when
extracting tested responsibilities. Algorithms work on an internal storage
interface and share geometry helpers; they should not call public snapshot APIs
inside tight loops. Keep a single source of truth for length/classification so
graph convenience methods and snapshot materializers cannot drift.

Cutover is complete: `src/SpatialGraph.ts` is the composition facade, and
`src/index.ts` exports only the 2.0 API. The transitional `SpatialGraph.next.ts`,
old implementation/types, and global constants are removed. The paths above
match the implementation; there is no second legacy facade or edge model.

## 13. Implementation phases and acceptance gates

### Phase 0 — Inventory the consuming project and preserve current data

Deliver: actual use inventory of exports, inherited Graphology calls, coordinate
scales, metadata types/IDs/weights, stored JSON, and any editor history/events.
Add representative anonymized fixtures and baseline expected routes/edit outcomes.
Check whether the editor-demo PR has merged when implementation begins.

Gate: every used method has a migration destination; stored files have an
import strategy; integer precision and geometric weight assumptions are known.

**Completed 2026-10-08 for the repository and consumer code available.**
[consumer-inventory.md](consumer-inventory.md) records the actual API calls,
subclass/protected-method use, metadata and persisted format, 2.0 migration
destinations, synthetic fixtures, and 36 baseline tests. The consumer has no
routing flow and no saved library `export()` payload; it stores its own skeleton
JSON. Four inherited-API destinations identified there are proposed in section
7.2 above. Five external-data or product decisions remain in inventory section
9.4 (including real producer coordinates and whether to keep the unused
beautify path). They are Phase 1/consumer-migration inputs, not a reason to
repeat the inventory. PR #17 remains open as of 2026-10-09; its demo imports
helpers removed by PR #19 and needs adaptation if it merges.

### Phase 1 — Establish coordinates, storage, and snapshot objects

**Implementation status (2026-10-10):** Library gate passed; consumer adapter fixtures use typed metadata and integer precision.

Deliver: composition facade, internal records, finite validation, per-instance
precision, generic metadata, `SpatialNode`/`SpatialEdge`, canonical equality,
Euclidean distance, classification, midpoint, length, basic CRUD/queries, and
detached Graphology/Flatten adapters. Change names directly on a development
branch; do not publish a half-migrated package.

Start from current `main` at 1.1.0. Replace the consumer's
`CirculationGraph extends SpatialGraph` with composition or an application
adapter using public spatial methods; its protected `addEdgeWithAttrs` and
`parseNode` uses cannot carry over unchanged. Preserve the consumer's key
format with `coordinatePrecision: 0`, its label counters through graph-metadata
methods, and its stored JSON through its own load/save adapter. Provide
`nodeCount`/`edgeCount`, key-to-node lookup, and any needed controlled iteration
before removing inherited Graphology methods. Define generic consumer attribute
types so `width` remains type-safe after 1.1.0 removed it from the package type.

Gate: key/coordinate consistency; the proposed property-based usage works;
retained snapshots remain readable and unchanged at the top level; public
methods cannot bypass storage validation. Graph and snapshot calculations agree
at retrieval time. Type declarations preserve consumer attribute types.

### Phase 2 — Make graph edits predictable and preserve data

**Implementation status (2026-10-10):** Library gate passed: planned edits, conflict policies, metadata and import regressions are covered.

Deliver: transactional batch moves, deterministic merging/conflicts, insertion
reports, validated split, safe join, explicit bend collapse, union/copies/
subgraphs, label/attribute operations, and versioned serialization with legacy
import. If needed, emit controlled operation events only after commit.

Gate: invalid input leaves the whole graph unchanged; swaps/chains/collisions
have specified results; existing metadata and copy behavior survive; all probe
regressions have tests. User IDs are never silently rewritten.

### Phase 3 — Migrate traversal, nearest, and routing

**Implementation status (2026-10-10):** Library gate passed: traversal, indexed/reference nearest and routing differential tests pass. Real company application migration is separate work, not a library release gate.

Deliver: key-based traversal, Graphology DFS components, exact nearest scan, structured
paths, length versus cost separation, and custom costs if supported by the
selected routing implementation. Update every example and recipe.

Gate: decomposition covers each edge once, components partition nodes, nearest
geometry agrees with a reference, and routing matches reference costs.
Representative consumer fixtures cover editing flows; the actual company project
may migrate after library release.

### Phase 4 — Complete the coordinated 2.0 delivery

**Implementation status (2026-10-10):** Repository delivery gate passed. Package version is 2.0.0 on this development branch; no tag, npm publication or real consumer migration was performed.

Deliver: explicit public exports, removal of application assumptions, dependency
compatibility checks, documentation/API reference, and package validation.
Consumer migration may follow release. Update `AGENTS.md` to replace tuple-only and inheritance
guidance with the new coordinate/element contracts. Update `README.md`,
`llms.txt`, affected examples, and recipe tests in the same implementation change.

The initial explicit export list and removal of redundant root exports were
completed in 1.1.0. This phase reviews additions to that list for the new 2.0
API and finishes application-policy removal; it does not redo PR #19.

Gate: all repository checks pass; published files remain within the existing
allowlist; ESM/CJS declarations and consumer imports work; legacy data is migrated
or explicitly supported; no stale public examples remain. Add the examples
check to publishing. Release by a matching version/tag through GitHub Actions.

### Phase 5 — Add measured scalability and independent features

**Implementation status (2026-10-10):** Implemented in this branch with acceptance tests. Performance experiments live in a separate local repository. The deliberately deferred features in section 9 remain deferred.

Deliver separately: RBush index, A*, virtual routing,
overlap-aware planarization, deterministic nearby-node merging, and GeoJSON.
Keep each feature behind its own acceptance tests and documented contract.

Gate: index output agrees with scans across mutation sequences; virtual routing
leaves export/revision unchanged; planarization reports grid incompatibility and
has idempotence fixtures; adapter round trips retain intended metadata.

No time estimate is assigned from the inventory alone. The phases are
dependency order, not a promise that every issue belongs in one release.

## 14. Verification plan for the refactor

### Targeted unit and integration tests

- Coordinates: finite validation, negative zero, negative rounding boundaries,
  exact/fractional modes, normalization overflow, key consistency, and precision
  preservation across every copy/factory/subgraph/import path. Reject operations
  whose derived geometry is non-finite even when each input coordinate is finite.
- Snapshots: no owning-graph reference; fresh/frozen tuples; copied top-level
  attributes; documented nested sharing; no mutation through returned objects;
  readable after removal and movement; refetch updates topology/classification.
- Equality/distance: same-key snapshots equal regardless of metadata; deletion
  and recreation at the same coordinates equal; distinct coordinates unequal;
  distance symmetric, zero for equal nodes, and correct for a 3–4–5 pair.
- Classification: isolated, stub, straight intermediate, bent corner, degree-3+
  junction, reversed neighbor order, tolerance boundary, and canonical-coordinate
  lookup equivalence. Do not infer corner merely from degree 2.
- Edges: reversed endpoint equality, fractional midpoint without a member node,
  geometric length independent of user weight, missing graph conveniences return
  null, and endpoint snapshots belong to one materialization revision.
- Mutations: endpoint split/no edge, off-edge split, precision-displaced split,
  replacement-edge conflicts, unchanged state after rejection, diagonal exact
  splitting, preservation of labels/metadata, deliberate ID callback behavior.
- Movement: swaps, chains, many-to-one collision, stationary destination, repeated
  source entries, collapsed self-loop, duplicate rewiring, deterministic conflict
  resolution, no-op at the same canonical coordinate, old snapshot retention.
- Join/cleanup: straight intermediate joins, bent-node rejection, triangle
  rejection by safe join, explicit destructive collapse, and cycle preservation.
- Routing: missing/disconnected and same-node results, total length versus cost,
  zero cost, excluded edges, invalid cost, multiple routes, ordered traversal,
  and A*/Dijkstra agreement under a valid heuristic.
- Serialization/adapters: strict legacy key parsing, invalid topology/numbers,
  collisions, future schema versions, shallow metadata ownership, copy modes,
  Graphology adapter independence, and unsupported Flatten arc rejection.

### Property tests with constraints

Use generated finite, loop-free, simple graphs. Compare canonical graph content
rather than insertion order/generated edge keys when the property concerns
geometry/topology. Preserve and report reproducible seeds.

| Property | Required qualifications |
| --- | --- |
| Split then safe join restores geometry/topology | Strictly interior collinear representable point; no preexisting replacement/join edge; metadata callback policy tested separately |
| `findPaths` covers every edge once | Count undirected canonical pairs; allow repeated terminal nodes and closed cycles |
| Components partition nodes | Include isolated nodes; every edge's endpoints occur in the same component |
| Simultaneous moves independent of input permutation | Valid unique sources; deterministic default conflicts; canonical comparisons; stateful custom callbacks excluded |
| Serialization round trip | JSON-compatible metadata and supported schema; same coordinate options |
| Equality is reflexive/symmetric/transitive | One graph and its canonical coordinate policy |
| Nearest indexed answer matches scan | Same tie-breaking and numerical policy, including after mutations |
| Geometric route cost equals route length | Default length cost only; custom costs intentionally differ |
| Planarization idempotent | Supported overlap policy and representable crossings; no hidden reshape |

Keep performance experiments in the separate local repository. CI here checks
correctness and index invalidation, without benchmark jobs or wall-clock
thresholds. No test is needed
merely to assert that a getter calls the chosen helper.

### Required delivery checks

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:package`, and
`pnpm check:examples`, in that dependency order where relevant. Add ESM/CJS
type-consumer fixtures for generic node/edge classes and a browser smoke test
if browser support is promised. Run the consuming project's checks separately;
library tests cannot prove its migration is complete.

## 15. Decisions and risks to carry into implementation

| Decision | Recommendation | Consequence / remaining evidence |
| --- | --- | --- |
| Snapshot versus live object | Snapshot, no graph reference | `node.type` becomes stale after edits; fetch again; nested metadata sharing documented |
| Node identity | Canonical coordinates within one graph | Recreation at the same position compares equal; no temporal or cross-graph identity |
| Graphology inheritance | **Decided: replace with composition** | Inventory confirms one consumer subclass and protected helpers must migrate. Internal algorithms use the private graph directly; detached adapters cost O(V+E) only when called |
| Default precision | Implemented: exact finite coordinates (`null`) in 2.0 | Inventory confirms the current consumer must choose `0` to retain grid identity and stored keys; floating-point closeness still explicit |
| Classification | Five labels; corner means a bend | Consumer switch statements need exhaustive update; validate angle tolerance on real fixtures |
| Missing graph values | `null` for scalar/object queries | Callers must handle null instead of zero/empty dictionaries/nearest exceptions |
| Length/cost | Derived length; callback-defined cost | Legacy user weight no longer overwritten; custom cost after splitting needs explicit semantics |
| Metadata ownership | Copy/shallow-freeze top level | Nested mutable objects remain shared unless a clone hook is configured |
| Conflict resolution | Existing destination wins; canonical ordering otherwise | Changes input-order-dependent outcomes; verify intended company merge behavior |
| Split/join | Geometrically safe by default | Existing editor shortcuts may need explicit reshape/collapse operations |
| Unsupported curves | Reject with actionable error | Data that previously lost arcs silently now fails visibly |

The inventory makes the migration reviewable: it identifies actual raw
Graphology calls, 44 files importing the package, the editor's drag/rebuild
behavior, integer-grid identity, typed width, labels, in-session IDs, and its
independent stored JSON/history. Use its fixtures to protect those behaviors;
resolve the five remaining external questions before changing affected consumer
flows. Composition, five classifications, exact precision default, and result shapes
are implemented. External consumer assumptions still need verification in that
project during its migration. Per the owner's release decision, application
migration does not gate publication and may use the released 2.0 package.

## 16. Implementation status and validation

For the later review of consumer/contributor instructions and executable examples,
see [Examples and agent-readiness audit](agent-readiness-audit.md). It documents
the expanded example learning path and automatic README/llms snippet checks.
The six-example validation count below records the original implementation run.

The repository now exposes the redesigned `SpatialGraph` directly. There is one
Graphology adjacency store, protected by ECMAScript private fields, plus derived
node and edge RBush indexes. Snapshots have no graph reference. Classification,
distance, midpoint, projection, and intersections use shared tuple helpers;
Flatten objects are created only at explicit adapter boundaries.

The public contract is implemented in [SpatialGraph.ts](../src/SpatialGraph.ts),
[SpatialNode.ts](../src/SpatialNode.ts), [SpatialEdge.ts](../src/SpatialEdge.ts),
and [types.ts](../src/types.ts). Required generic node fields require a factory
for implicit endpoints; required metadata arguments cannot be omitted. Coordinate
options are read-only at runtime. Top-level snapshot data is copied/frozen;
clone hooks provide nested isolation. Callback failures are evaluated during
planning before live mutations, including returned snapshots' clone hooks.
`fromJSON` and `fromGraphology` block inference of metadata from their option
arguments with `NoInfer`, matching the constructor. Policy-only imports use
default metadata types without requiring a factory; explicit required schemas
retain factory and attribute checks in ESM/CJS declarations.
The inference-fix follow-up passes all seven repository checks, with 95 tests
in 11 files and eleven asserting examples. The original validation counts below
are historical, not the current suite size.

| Area | Delivered behavior and evidence |
| --- | --- |
| Node/edge model | Five labels; canonical coordinate equality; retained snapshots; separate tuple collections; derived midpoint/length |
| Editing | Batch insertion reports; simultaneous moves/swaps/chains; deterministic merges; strict split; safe join; explicit bend collapse; labels; copies/subgraphs/union |
| Geometry/indexes | Exact projection, stable insertion-order nearest ties, incremental RBush updates, scan reference, crossing/T/overlap planarization, transitive nearby clusters |
| Routing/traversal | Graphology DFS components; edge-once chains/cycles; Graphology shortest-path Dijkstra and reopening A*; custom nonnegative/zero/closed costs; geometric virtual routes |
| Persistence | Version-2 spatial JSON, validated replace/merge imports, explicit legacy migration with collision reports, detached Graphology, straight Flatten, Cartesian GeoJSON |
| Consumer fixtures | Integer-grid load/save adapter with typed width/IDs/labels; move, merge, split/connect, join/collapse and producer-rounding acceptance flows |
| Package | ESM/CJS and both declaration formats, unchanged files allowlist, bundled RBush/quickselect notices, Graphology 0.26 integration |

The routing follow-up replaces the original custom search with
`graphology-shortest-path` and introduces the public `PathAlgorithm` enum.
Ordinary searches use private adjacency; closed-edge and virtual queries use
temporary copies. Existing A* reopening and generated differential regressions
remain in place, with additional closure, zero-cost, overflow, and virtual
projection cases. The counts below record the original implementation run.

The component follow-up removes local BFS and calls
`graphology-components.connectedComponents` directly on private adjacency,
without exporting or copying the graph. Results become DFS-ordered snapshots;
isolated nodes and empty-graph results are preserved. The consumer inventory
records the effect on traversal-based labels, and a regression covers ordering,
disconnected groups, snapshots, and unchanged query state. Local decomposition
still covers every edge once in maximal degree-2 chains/cycles, a different
contract from Graphology's simple-path enumeration.

Repository validation on Node 24.14.0, Apple M1 Max/macOS arm64:

- `pnpm typecheck` and `pnpm test`: passed, 64 tests in 10 files with targeted
  regressions and seeded properties,
  including six runnable recipes. Graphology compatibility is part of this suite.
- `pnpm build`, `pnpm check:package`, `pnpm check:examples`: both module/declaration
  formats, package validation, and examples against the built package.
- `pnpm check:consumers`: ESM/CJS generic declaration fixtures and real runtime
  imports exercising edits, indexes, routing, JSON and Flatten conversion.
- `pnpm check:browser`: esbuild browser bundle of `dist` running in Chromium,
  covering snapshots, edits, queries, A*, virtual routes and adapters.

The CJS runtime probe exposed an ESM-only RBush interop failure that package
linting did not detect. RBush and quickselect are now bundled into both entries,
with their license notices. Runtime consumers run in CI and release validation.
Generic type fixtures use `skipLibCheck: true`: upstream interval-tree 2.0.3
(which Flatten references) has extensionless declaration imports rejected under
strict NodeNext dependency checking. Consumer expressions and expected generic
errors are still checked; this branch does not claim to repair that upstream file.

The library version is prepared as `2.0.0`; publication remains tag-driven. No
release tag is created by implementation. Browser evidence covers Chromium,
not a complete browser matrix. CI is configured for Node 22 and 24; the local
run used Node 24. The actual company application is not available in this
workspace, so its 44 importing files, real stored data, and application build
have not been migrated or validated. The repository's representative fixtures
pass. Application migration is not a library release gate and may target the
released 2.0 package. PR #17 remains open and its editor
will need the same API migration if adopted. GitHub issue statuses are unchanged.

## Appendix A. Reproducing the main correctness probes

Run on the audited `v1.0.1` tag or commit `6aefd1f` after `pnpm build`,
from that checkout's repository root. Do not run this old probe unchanged against
1.1.0: `nearestPointOnSegment` and `findIntersection` are no longer root exports.
This script intentionally confirms the old behavior, including undesired
behavior; it is not the expected test suite for the refactor.

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {SpatialGraph, nearestPointOnSegment, findIntersection} from './dist/index.js';
import {Point, Segment} from '@flatten-js/core';

const line = (a, b) => new Segment(new Point(...a), new Point(...b));

const raw = new SpatialGraph();
raw.addNode('label');
raw.addNode('1junk,2');
assert.equal(raw.order, 2);
assert.deepEqual(raw.getNodes(), [[1, 2]]);

const invalid = new SpatialGraph();
invalid.addVertex([Infinity, 0]);
invalid.addVertex([NaN, 0]);
assert.equal(invalid.order, 2);
assert.deepEqual(invalid.getNodes(), [[Infinity, 0]]);

const snapped = new SpatialGraph({segments: [line([0, 0], [3, 1])]});
const [point, edge] = snapped.projectPointOnClosestEdge([1, 1]);
assert.deepEqual(point, [1, 0]);
assert.equal(line(...edge).contains(new Point(...point)), false);
const exact = nearestPointOnSegment([1, 1], edge).point;
assert.ok(Math.abs(exact[0] - 1.2) < 1e-10);
assert.ok(Math.abs(exact[1] - 0.4) < 1e-10);

const weighted = new SpatialGraph({segments: [line([0, 0], [10, 0])]});
weighted.getEdgeAttributesFor([[0, 0], [10, 0]]).weight = -5;
assert.equal(weighted.getPathLength([[0, 0], [10, 0]]), -5);

const split = new SpatialGraph({segments: [line([0, 0], [10, 0])]});
split.splitEdge([[0, 0], [10, 0]], [5, 50]);
assert.equal(split.size, 2);
assert.ok(split.hasPointNode([5, 50]));

const move = (reverse) => {
  const g = new SpatialGraph();
  g.addVertex([0, 0], {value: 'a'});
  g.addVertex([10, 0], {value: 'b'});
  const moves = [[[0, 0], [20, 0]], [[10, 0], [20, 0]]];
  g.moveNodes(reverse ? moves.reverse() : moves);
  return g.getPointAttributes([20, 0]).value;
};
assert.equal(move(false), 'a');
assert.equal(move(true), 'b');

const angle = new SpatialGraph({segments: [
  line([0, 0], [10, 0]), line([0, 0], [0, 10]),
]});
assert.equal(angle.getPointKey([0, 0]), angle.getPointKey([0.49, 0.49]));
assert.equal(angle.hasOrthogonalEdges([0, 0], 0), true);
assert.equal(angle.hasOrthogonalEdges([0.49, 0.49], 0), false);

assert.equal(findIntersection([[0, 0], [10, 0]], [[5, 0], [15, 0]]), null);
console.log('Audited baseline behavior reproduced.');
JS
```
