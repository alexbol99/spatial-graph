# Interactive Graph Editor Demo: Design Document

Date: 2026-10-01
Status: Implemented on branch `feat/graph-editor-demo`

## 1. Goal

Add an interactive graph editor to the repository as a runnable demo, to show
`SpatialGraph` doing real editing work: moving nodes, splitting edges, collapsing
nodes, joining and pruning.

The editor is a port of an existing production editor for a floor-plan
circulation graph (design notes: `graph-editing-design.md` and
`graph-editing-actions.md` in the source project). The port changes four things:

1. **No wrapper class.** The editor works on a plain `SpatialGraph`. All
   editing logic is free functions over it.
2. **Abstract graph, no polygons.** Nodes are points, edges are segments with a
   `width` attribute. Nothing is converted to a polygon, buffered, unioned or
   clipped. The graph is the only output.
3. **SVG, not canvas.** Every element on screen is an SVG node.
4. **Two snaps only: to a vertex and to an edge.**

Width is data here, not an editable property: each edge carries a `width`
attribute that sets how thick it is drawn, and edges inherit it when split or
extended, but the editor has no way to change it.

The demo is a Vue 3 + Vite project in `src/demo/`, started with one command on
localhost. It is a development aid. It is not part of the published package.

## 2. Scope

### Kept from the source

| Area | What is kept |
| --- | --- |
| Run move | Drag a run perpendicular to its axis; double-click narrows to one edge |
| Vertex move | Drag a vertex; connected edges stretch |
| Topology on drag | Near a vertex: collapse into it. Near an edge: split it and connect |
| Add vertex | Click an edge's insertion ghost, or Ctrl+click an edge |
| Add edge | Ctrl+drag from a vertex, from an edge, or from empty space; width is inherited, 140 from empty space |
| Crossings | A new edge that crosses existing edges splits them and becomes a chain |
| Delete | Vertex (right-click, or select + Delete), run, single edge, all edges (with confirmation) |
| Selection scopes | `run`, `edge`, `all` with matching hover and selection ink |
| Hit priority | Vertex, insertion ghost, body, empty space |
| Cancel and pan | `Esc` cancels the gesture; `Space` pans |
| Cursors | Cursor reports the gesture under the pointer |
| Screen-stable annotation | Handles, rings, centreline sizes are px divided by zoom |

### Dropped

| Dropped | Why |
| --- | --- |
| Width editing (width marker, inline input, 80 to 450 range check, `Ctrl+A` over markers) | Out of scope by request. `width` is read-only data |
| The "keep one edge" rule on delete-all | Exists only because an empty circulation cannot be saved in the source. An empty graph is valid here; Undo restores it |
| Snap to perimeter, core, rulers | No flood polygon or rulers in an abstract graph |
| Direction lock to adjacent edges | A snap; out of scope |
| Alignment snaps (stub, collinear, square corner, square T) | Snaps; out of scope |
| Option key to suppress snaps | The only remaining snaps are topology, which the source also never suppressed |
| `toCirculationPolygonWkt`, JSTS, T-junction pullback | Polygon conversion |
| Flood clip, `geometryChange(wkt)`, `saveCirculation` | Persistence of polygons |
| Polygon-ring editor and its submenu | Different tool |
| `CirculationGraph` class, `ensureEditingIds` | No wrapper class (see 4.2) |

### Constraint kept on purpose

Run and edge drags stay **perpendicular to the run's axis**. That is a movement
constraint, not a snap, and it is what makes the gesture predictable. It is kept.

### Added for the demo

- Undo and redo (`Ctrl+Z`, `Ctrl+Shift+Z`). The source gets these from the host
  application's store; a standalone demo needs its own.
- A sample graph, a "Reset" button, a "Fit view" button and a status bar.

## 3. Terminology

The library is domain-neutral (see `AGENTS.md`), so the port renames the source
vocabulary:

| Source | Here |
| --- | --- |
| circulation graph | graph |
| corridor | **run**: a maximal chain of edges that are collinear and share one width |
| corridor body | **body**: the strip drawn around an edge, `width` wide |
| skeleton edge | edge |
| midpoint ghost | **insertion ghost** |

Coordinates are SVG user units, y down. They play the role of centimetres in the
source, so the thresholds below carry over unchanged.

## 4. Architecture

```
┌────────────────────────── Vue (src/demo) ──────────────────────────┐
│ App.vue ─ toolbar, hint panel, status bar, toast, confirm dialog    │
│   └ GraphEditor.vue ─ <svg>, pointer and key wiring                 │
│        ├ GraphLayers.vue   passive graph drawing                    │
│        └ OverlayLayers.vue hover, selection, rings, draw preview    │
└───────────────┬─────────────────────────────────────────────────────┘
                │ world-space events in, view-state out
┌───────────────▼──────────── editor/ (framework-free TS) ────────────┐
│ EditorController  gestures, selection, history                      │
│ hit · snap · runs · ops · move · draw      pure functions           │
└───────────────┬─────────────────────────────────────────────────────┘
                │ plain method calls
┌───────────────▼─────────────────────────────────────────────────────┐
│ SpatialGraph  (from src/, via alias, no wrapper)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 Layers

- **`editor/` has no Vue and no DOM.** It takes pointer positions already
  converted to world coordinates, plus the zoom scale, and returns plain data.
  This is what the tests cover, including whole gestures.
- **The Vue layer only translates.** DOM event to world event, view state to SVG.
  It holds no editing rules.
- **`EditorController` is not a graph wrapper.** It owns the interaction state
  (selection, current gesture, history) and holds a `SpatialGraph` that it passes
  to free functions. It does not subclass, proxy or re-expose the graph.

### 4.2 Graph usage

- The graph is a plain `SpatialGraph` kept in a `shallowRef`. It is never made
  deeply reactive. After each mutation the controller bumps a `version` counter,
  and the render layer reads the graph through that.
- Edge attribute `width` (already in `EdgeAttributes`) is the only domain data.
  Nodes carry none. It is set when an edge is created and never edited.
- **No stable ids.** The source adds an `id` attribute to nodes and edges so a
  selection survives a coordinate change. `SpatialGraph.splitEdge` rewrites `id`
  to a coordinate-derived key, so such ids are not stable here. Instead:
  - an edge is identified by its two endpoints (`NxEdge`);
  - a drag is a pure function of the gesture-start snapshot (4.3), and returns a
    `moved: Map<nodeKey, NxPoint>` so selection is remapped through it.
- Node keys are rounded to `COORDINATE_PRECISION` (0, whole numbers). Keys are
  only obtained through `graph.getPointKey`. Dragging therefore lands on the
  integer grid, which is invisible at the demo's scale.

### 4.3 Drags are replays of a snapshot

At gesture start the controller takes `base = graph.export()`. On every pointer
move it does `graph.clear(); graph.import(base)` and applies the whole operation
again from the start pointer to the current pointer.

- No drift, however slowly the user drags.
- Collapse and split are previews that cost nothing to undo: moving away from a
  target restores the graph exactly.
- `Esc` is `restore(base)`. Pointer-up pushes one history entry.
- Cost is linear in graph size per move. Demo graphs have tens of edges.

### 4.4 History

A stack of `graph.export()` snapshots, capped at 100. One entry per committed
gesture, so a delete-all or a width change over many edges is one undo step.
Preview states are never pushed.

### 4.5 Source layout

```
src/demo/
  index.html  main.ts  App.vue  env.d.ts
  vite.config.ts  tsconfig.json
  components/   GraphEditor.vue  GraphLayers.vue  OverlayLayers.vue
                HintPanel.vue  ConfirmDialog.vue
  composables/  useViewport.ts
  editor/       (no Vue, no DOM)
    constants.ts   thresholds
    types.ts       Hit, Selection, Scope, Run, Ring
    util.ts        vector helpers, edge identity, width lookup, selection remapping
    runs.ts        run detection
    hit.ts         hit testing and priority, insertion ghosts
    snap.ts        snap to vertex, snap to edge
    ops.ts         insert vertex, remove vertex, remove edges
    move.ts        vertex move with topology, slide along a normal
    draw.ts        new-edge planning and commit (crossings)
    history.ts     snapshot stack
    render-model.ts  what the passive layer draws; graph bounds
    controller.ts  EditorController
    sample.ts      sample graph and a builder for tests
    __tests__/     *.node.spec.ts
```

## 5. Algorithms

### 5.1 Run detection (`runs.ts`)

Two edges that meet at a node continue each other when the angle between them,
measured at that node, is within 3° of 180° and their widths differ by at most
0.5. This holds at any degree, so a run passes straight through a T or a +.

At a node with several candidate pairs, pairs are taken greedily by smallest
deviation from 180°, and an edge joins at most one pair per node. This keeps a
run from swallowing two near-parallel arms on the same side. Runs are the
connected components of the "continues" relation (union-find over edges).

A run reports `edges`, `nodes`, `width` and `axis` (first node to last node, used
for the move normal). Runs are derived on demand from the graph and never stored.

### 5.2 Hit testing (`hit.ts`)

Order, first match wins: vertex, insertion ghost, body, empty. All thresholds
are screen px divided by the zoom scale `s`.

| Target | Test |
| --- | --- |
| Vertex | within `VERTEX_RADIUS` px of a node, capped at the narrowest adjacent half-width |
| Insertion ghost | within `GHOST_RADIUS` px of an edge's midpoint |
| Body | `distance(point, edge) <= max(width / 2, BODY_MIN_HIT px)`; nearest centreline wins |
| Empty | none of the above |

Distances use `nearestPointOnSegment` from the package, which does not allocate.

**Insertion ghost.** Sits at the midpoint of an edge. It is shown while the pointer
is within `GHOST_SHOW` px of it, and only on an edge at least `GHOST_MIN_SPAN` px
long on screen, so it never touches the two vertex handles.

### 5.3 Snapping (`snap.ts`)

Exactly two targets, tested in this order, both with a screen-stable tolerance:

1. **Vertex**: nearest other node within `VERTEX_SNAP_TOL`.
2. **Edge**: nearest point on the nearest eligible edge within `EDGE_SNAP_TOL`,
   and the point must be interior to the edge (not within a rounding step of
   either endpoint, where it would be the vertex case).

`snapToGraph(graph, point, { tol, excludeNodes, excludeEdges })` returns
`{ kind: 'vertex', point } | { kind: 'edge', point, edge } | null`.

Snap results are shown by a ring: **red** when a dragged vertex will collapse into
a vertex, **green** for every other snap.

### 5.4 Vertex drag (`move.ts`)

Given the base snapshot, the vertex `v0`, and the pointer delta from gesture start:

1. `candidate = v0 + delta`.
2. `snapToGraph(candidate)` excluding `v0` and the edges incident to `v0`.
3. Replay from `base`, then:
   - vertex snap: `graph.moveNode(v0, target)`. `moveNodes` merges onto an
     existing node and drops the self-loop if the two were adjacent, so
     collapsing into a neighbour deletes that edge for free;
   - edge snap: `graph.splitEdge(edge, point)`, then `graph.moveNode(v0, point)`,
     which merges `v0` into the new split node;
   - no snap: `graph.moveNode(v0, candidate)`.

The result is the final vertex position and the ring to draw. The vertex stays
selected at that position.

### 5.5 Run and edge drag (`move.ts`)

Scope `run` moves every node of the run; scope `edge` moves the two endpoints of
one edge. Adjacent edges outside the moved set stretch, because `moveNodes` moves
the node and its edges follow.

1. The **anchor** is the pointer-down point projected onto the pressed edge.
2. The raw delta is projected onto the axis normal `n`. The pressed edge's
   direction gives `n` at edge scope; the run axis gives it at run scope.
3. `candidate = anchor + t * n`. Snap to vertex or edge (5.3), excluding the moved
   nodes and any edge incident to them.
4. If snapped, `t` becomes `(target - anchor) . n`. The delta stays on the normal,
   so a snap never slides the run along its own axis.
5. Replay from `base` with `moveNodes`.

### 5.6 New edge (`draw.ts`)

Start `s`:

| Pressed on | Start | Width |
| --- | --- | --- |
| a vertex | that vertex | width of an incident edge, else `DEFAULT_WIDTH` |
| an edge body | projection on the edge | that edge's width |
| empty space | the pointer (rounded) | `DEFAULT_WIDTH` (140) |

End `e` is the pointer, snapped by 5.3 (vertex or edge). `planNewEdge` is pure and
returns the ordered points the chain will pass through; the live preview is drawn
from it and nothing is applied until pointer-up.

1. Collect crossings of segment `s -> e` with every existing edge using
   `findIntersection`. Crossings that coincide with `s` or `e` are dropped.
2. Order `[s, ...crossings, e]` by distance along the segment.
3. Commit, per point: if it lies in the interior of an existing edge, `splitEdge`
   there (this handles the start-on-edge, end-on-edge and crossing cases the same
   way). Then `addSegment` between consecutive points with the chosen `width`.
   An edge that already exists is skipped (`addSegment` keeps existing attributes).
4. A segment shorter than `MIN_NEW_EDGE_LENGTH` is discarded on pointer-up.

Dragging a new edge along an existing one only splits it; it adds no duplicate
edge. That is accepted behaviour.

### 5.7 Deletes (`ops.ts`)

| Action | Rule |
| --- | --- |
| Vertex, degree 0 or 1 | `removePoint` / `removeStubPoint` |
| Vertex, degree 2 | `removeDegree2PointAndJoin`, with `width` set to the wider of the two edges. **Refused** when the two neighbours are already adjacent: the library would drop the node without joining, losing both edges |
| Vertex, degree 3 or more | Refused with a message; no change |
| Run (scope `run`) | `removeEdge` for each edge of the run |
| Edge (scope `edge`) | `removeEdge` for that edge |
| All (scope `all`) | After confirmation, remove every edge. The graph may end up empty |

After any edge removal, nodes left at degree 0 are removed (so deleting all edges empties the graph). Degree-1 nodes stay.
Removal may disconnect the graph; that is allowed.

### 5.8 Width

Read-only. `widthOf(graph, edge)` returns the `width` attribute, or `DEFAULT_WIDTH`
(140) when an edge has none. It decides how thick the body is drawn and how wide
the hit area is. `splitEdge` copies it to both halves, a drawn edge takes it from
where it started (5.6), and a joined pair takes the wider (5.7).

## 6. Interaction

### 6.1 Gesture reference

`Mod` means Ctrl or Cmd. Both are accepted because on macOS a Ctrl+click is also a
context-menu click; `Cmd` avoids that, and the `contextmenu` handler ignores events
that have Ctrl held (6.4).

| Gesture | Effect |
| --- | --- |
| Drag body | Move the run perpendicular to its axis |
| Click body | Select the run |
| Double-click body | Select one edge; a drag then moves only that edge |
| Drag vertex | Reshape connected edges. Near a vertex: collapse. Near an edge: split and connect |
| Click insertion ghost | Insert a vertex and drag it immediately |
| `Mod`+click edge | Insert a vertex at the projected point, without dragging. On a vertex: no-op |
| `Mod`+drag from vertex or edge | Draw a new edge from there |
| `Mod`+drag from empty space | Draw a free edge, width 140 |
| `Mod`+A with a run or edge selected | Select all edges (scope `all`); `Delete` then asks to confirm |
| Right-click vertex, or select vertex + `Delete` | Delete the vertex |
| `Delete` / `Backspace` | Delete the selection: run, edge, or all edges (confirm) |
| Click empty space | Clear selection |
| Drag empty space, middle-drag, or `Space`+drag | Pan |
| Wheel | Zoom about the pointer |
| `Esc` | Cancel the gesture, close the dialog, clear selection |
| `Mod`+Z, `Mod`+Shift+Z | Undo, redo |

Pointer-down while `Space` is held is ignored by the editor so pan wins.

### 6.2 Controller states

```
            ┌──────────────── idle ◄────────────────┐
            │                                       │
  down on vertex ─► pendingVertex ─move>4px─► draggingVertex ─up─► commit
  down on ghost  ─► (insert) ─────────────► draggingVertex
  down on body   ─► pendingBody ──move>4px─► draggingBody  ─up─► commit
                        └─up (no move)─► select run
  down + Mod     ─► pendingDraw ─move>6px─► drawing        ─up─► commit
                        └─up (no move)─► insert vertex on edge
  down on empty  ─► pendingPan ───move>4px─► panning
                        └─up (no move)─► clear selection
  any dragging* / drawing ──Esc──► restore(base) ──► idle
```

### 6.3 Selection and hover ink

| Target | Hovered | Selected |
| --- | --- | --- |
| Run (click) | both faces of every edge, thin, blue | same faces, amber |
| Edge (double-click) | not shown | that edge's faces amber, plus a solid heavier centreline |
| All | hover suppressed | every edge's faces amber |
| Vertex | one ring, blue | same ring, amber |

The outline covers exactly what is in scope, so it always shows what `Delete` will
remove and what a drag will move. Hovering something already selected adds no
hover layer. A drag keeps the selected picture while the geometry moves.

### 6.4 Cursors and quirks

`move` over a vertex; a resize arrow along the run normal over a body (chosen from
`ew-resize`, `ns-resize`, `nesw-resize`, `nwse-resize` by normal angle);
`copy` over an insertion ghost; `crosshair` while drawing; `grab`
while `Space` is held, `grabbing` while panning.

The `contextmenu` event is always `preventDefault`ed on the surface. It deletes a
vertex only when it fires over a vertex with Ctrl not held.

## 7. Rendering (SVG)

One `<svg>` fills the canvas. A single `<g>` carries the viewport transform
`translate(tx, ty) scale(s)`; everything inside is in world units.

Layers, bottom to top:

1. Grid (`<pattern>`, 100 units).
2. Bodies: one `<line>` per edge, `stroke-width = width`, square caps, so a bend
   has no wedge gap. T-junction pullback from the source is not needed: it exists
   to keep a polygon union smooth, and overlapping opaque strokes need no help.
3. Centrelines: dashed, `1.5px / s` wide.
4. Vertices: stub, pass-through and junction are drawn differently.
5. Hover and selection ink (6.3).
6. Insertion ghost, snap ring, new-edge preview, crossing ticks.

Sizes follow the source rule: **annotation is screen px divided by `s`; the body
is world units** because it is the real width.

Event handling is on the root `<svg>`: one `pointerdown`, `pointermove`,
`pointerup`, `dblclick`, `wheel`, `contextmenu`, with pointer capture during a
gesture. Individual SVG nodes get `pointer-events: none`; hit testing is ours, so
the order in 5.2 is exact and does not depend on paint order.

### 7.1 Viewport (`useViewport.ts`)

State `{ tx, ty, s }`. `toWorld(clientX, clientY)` subtracts the SVG's bounding
rect and inverts the transform. Wheel zoom keeps the point under the pointer
fixed; `s` is clamped to [0.05, 8]. "Fit view" fits the graph's bounding box with
a margin.

## 8. Tooling

- **Dependencies** (all `devDependencies`, so the published package is unchanged):
  `vue`, `vite`, `@vitejs/plugin-vue`, `vue-tsc`.
- **Scripts:**

  | Script | Does |
  | --- | --- |
  | `pnpm demo` | Vite dev server on `http://localhost:5173` |
  | `pnpm build:demo` | Production build of the demo into `demo-dist/` |
  | `pnpm typecheck:demo` | `vue-tsc --noEmit` on `src/demo/tsconfig.json` |

- **Vite alias** `@flatten-js/spatial-graph` to `src/index.ts`, so the demo runs
  against the live source with hot reload and needs no prior `pnpm build`. The
  same alias is already in `vitest.config.ts`.
- **Root `tsconfig.json`** gets `"exclude": ["src/demo"]`. The root config has no
  DOM lib and cannot read `.vue` files; the demo has its own `tsconfig.json`
  (DOM lib, bundler resolution, same strictness).
- **Output goes to `demo-dist/`, never `dist/`.** `tsdown` runs with `clean: true`
  and `dist/` is what gets published. `demo-dist/` is git-ignored.
- **Published package unchanged.** `files` stays `dist`, `README.md`, `llms.txt`,
  `LICENSE`; `src/demo` and `docs/` are not in it.
- **CI** gains `pnpm typecheck:demo` and `pnpm build:demo`.
- **`pnpm test`** keeps `include: ['src/**/*.spec.ts']`, so `src/demo/editor/__tests__`
  runs with the rest.

## 9. Testing

Unit tests, `*.node.spec.ts` in `src/demo/editor/__tests__/`, no DOM:

| Area | Cases |
| --- | --- |
| Runs | straight chain; bend splits; width change splits; passes through a T; two pairs at a +; near-parallel arms do not merge |
| Hit | priority order; vertex radius cap; body hit uses width; ghost only on edges long enough on screen |
| Snap | vertex beats edge; endpoint-interior rule; exclusions |
| Vertex move | free move; collapse into vertex; collapse into neighbour deletes the edge; split-and-connect; replay is drift-free; cancel restores |
| Run move | stays on the normal; edge scope moves two nodes; snap adjusts `t` only; neighbours stretch |
| New edge | from vertex, from edge, from empty; crossing becomes a chain; end on edge splits it; too short discarded |
| Deletes | stub, degree 2 join, degree 2 refused when neighbours adjacent, junction refused, run, edge, all edges, isolated nodes pruned |
| History | one entry per gesture; undo and redo; delete-all is one step |
| Controller | scripted gestures: drag a vertex, Ctrl+click, delete, `Esc` mid-drag |

The Vue layer is checked by `vue-tsc`, a production build, and a pass in the
browser against section 6.1 (pointer drag, selection ink, rings, draw preview,
delete-all dialog, undo, dark mode, phone width).

One test group asserts that every committed edit moves `graphRev`. The view layer
redraws only when it moves, and a missed bump left the picture stale in manual
testing; the tests were checked to fail without the fix.

## 10. Documentation changes

- `README.md`: a short "Demo" section with how to run it.
- `AGENTS.md`: add `src/demo/` to the layout and the three scripts to the commands,
  and say that demo code is not public API.
- `llms.txt` and `src/__tests__/recipes.node.spec.ts` are unchanged: no public
  behaviour of the package changes.

## 11. Risks and decisions to confirm

| Item | Note |
| --- | --- |
| Integer node grid | `COORDINATE_PRECISION` is 0, so positions are whole units. Fine for a 1600-unit-wide sample; not suited to small-unit data. Stated in the demo's hint text |
| Replay cost | Linear per pointer move; fine at demo size |
| Ctrl+click on macOS | Fires a context menu; handled by accepting Cmd and ignoring Ctrl in `contextmenu`. The ignore rule is covered by a controller test; a physical Ctrl+click was not exercised |
| Degree-2 join in the library | `removeDegree2PointAndJoin` drops the node without joining when the neighbours are already adjacent. The demo guards against it; the library behaviour is not changed in this work |
| Run detection is hop-wise | Like the source, each hop is tested within 3°, so a very long run may bend a little overall |
| Undo/redo, grid, fit button | Not in the source; added to make the demo usable standalone |

## 12. Implementation plan

Done, in this order:

1. Branch `feat/graph-editor-demo` from `main`; this document.
2. Tooling: dependencies, scripts, `src/demo` skeleton, tsconfig exclude, CI.
3. `editor/` core with tests: constants, runs, snap, hit, ops, move, draw, history.
4. `EditorController` with scripted-gesture tests.
5. Vue layer: viewport, SVG layers, overlays, hint panel, dialog.
6. Browser verification of every row in 6.1, desktop and narrow width.
7. README and AGENTS.md; full check run (`typecheck`, `typecheck:demo`, `test`,
   `build`, `build:demo`, `check:package`, `check:examples`).
