import type { NxEdge, NxPoint, SpatialGraph } from '@flatten-js/spatial-graph';
import { DRAG_THRESHOLD_PX, DRAW_THRESHOLD_PX, GHOST_SHOW_PX } from './constants.js';
import {
  commitNewEdge,
  planNewEdge,
  resolveDrawStart,
  type DrawStart,
  type NewEdgePlan,
} from './draw.js';
import { findGhost, hitTest } from './hit.js';
import { History } from './history.js';
import { moveVertex, slideAlongNormal } from './move.js';
import { insertVertex, removeEdges, removeVertex } from './ops.js';
import { detectRuns, indexRuns } from './runs.js';
import type { Ghost, Hit, Ring, Run, Scope, Selection } from './types.js';
import { add, dist, edgeKey, perp, remapEdges, sameEdge, sub, unit } from './util.js';

export type PointerInput = {
  /** Pointer position in world units. */
  world: NxPoint;
  /** Ctrl or Cmd is held: the draw modifier. */
  mod: boolean;
  /** Space is held: the editor stands aside so the viewport can pan. */
  space?: boolean;
  /** Pointer button; 0 is the primary one. */
  button?: number;
};

export type KeyInput = { key: string; mod: boolean; shift: boolean };

/** What the view layer needs to draw. A fresh object is made on every change. */
export type View = {
  /** Bumped whenever the graph changes. */
  graphRev: number;
  hover: Hit;
  /** Edges outlined as hovered; empty when the hovered run is already selected. */
  hoverEdges: NxEdge[];
  ghost: Ghost | null;
  selection: Selection;
  ring: Ring | null;
  preview: NewEdgePlan | null;
  confirm: 'deleteAll' | null;
  cursor: string;
  message: { id: number; text: string } | null;
  canUndo: boolean;
  canRedo: boolean;
  stats: { nodes: number; edges: number; runs: number };
};

type Slide = {
  nodes: NxPoint[];
  anchor: NxPoint;
  normal: NxPoint;
  edges: NxEdge[];
  scope: Scope;
};

type Gesture =
  | { kind: 'pendingVertex'; down: NxPoint; start: NxPoint; base: string }
  | { kind: 'vertex'; down: NxPoint; start: NxPoint; base: string; cancelTo: string }
  | { kind: 'pendingBody'; down: NxPoint; base: string; slide: Slide }
  | { kind: 'body'; down: NxPoint; base: string; slide: Slide }
  | { kind: 'pendingDraw'; down: NxPoint; start: DrawStart; edge: NxEdge | null }
  | { kind: 'draw'; down: NxPoint; start: DrawStart };

const NO_HOVER: Hit = { kind: 'empty' };

/**
 * Interaction state for the graph editor: selection, the gesture in progress,
 * history. It works on a plain `SpatialGraph` that it passes to the free
 * functions in this folder; it does not wrap or extend the graph.
 *
 * Input arrives in world units, so nothing here knows about the DOM or about
 * pixels except through `scale` (screen px per world unit).
 */
export class EditorController {
  readonly graph: SpatialGraph;
  view: View;

  private scale = 1;
  private selection: Selection = { kind: 'none' };
  private gesture: Gesture | null = null;
  private hover: Hit = NO_HOVER;
  private ghost: Ghost | null = null;
  private cursor = 'default';
  private ring: Ring | null = null;
  private preview: NewEdgePlan | null = null;
  private confirm: 'deleteAll' | null = null;
  private message: View['message'] = null;
  private messageId = 0;
  private graphRev = 0;
  private runCache: { rev: number; runs: Run[]; index: Map<string, Run> } | null = null;
  private hoverKey = '';
  private readonly history: History<string>;
  private readonly initial: string;
  private readonly listeners = new Set<(view: View) => void>();

  constructor(graph: SpatialGraph) {
    this.graph = graph;
    this.initial = this.serialize();
    this.history = new History(this.initial);
    this.view = this.makeView();
  }

  /** Call `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: (view: View) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScale(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.hoverKey = '';
    this.notify();
  }

  // ─── Pointer ──────────────────────────────────────────────────────────────

  /**
   * - `claimed`: the editor owns this gesture.
   * - `empty`: nothing was hit; the caller pans if the pointer moves, and calls
   *   {@link clickEmpty} if it does not.
   * - `ignored`: not an editing press (Space held, or not the primary button);
   *   the caller may pan.
   */
  pointerDown(input: PointerInput): 'claimed' | 'empty' | 'ignored' {
    if (input.space || (input.button ?? 0) !== 0) return 'ignored';
    this.ring = null;
    const world = input.world;

    if (input.mod) {
      const hit = hitTest(this.graph, world, this.scale, { ghosts: false });
      const start = resolveDrawStart(this.graph, hit, world);
      const edge = hit.kind === 'body' ? hit.edge : null;
      this.selection = { kind: 'none' };
      this.gesture = { kind: 'pendingDraw', down: world, start, edge };
      this.notify();
      return 'claimed';
    }

    const hit = hitTest(this.graph, world, this.scale);
    switch (hit.kind) {
      case 'vertex':
        this.selection = { kind: 'vertex', at: hit.at };
        this.gesture = { kind: 'pendingVertex', down: world, start: hit.at, base: this.serialize() };
        this.notify();
        return 'claimed';
      case 'ghost':
        return this.pressGhost(hit.edge, hit.at, world);
      case 'body':
        return this.pressBody(hit.edge, hit.at, world);
      default:
        return 'empty';
    }
  }

  pointerMove(input: PointerInput): void {
    const gesture = this.gesture;
    if (!gesture) {
      this.updateHover(input);
      return;
    }

    const travelled = dist(input.world, gesture.down) * this.scale;
    switch (gesture.kind) {
      case 'pendingVertex':
        if (travelled < DRAG_THRESHOLD_PX) return;
        this.gesture = { ...gesture, kind: 'vertex', cancelTo: gesture.base };
        this.dragVertex(this.gesture, input.world);
        break;
      case 'vertex':
        this.dragVertex(gesture, input.world);
        break;
      case 'pendingBody':
        if (travelled < DRAG_THRESHOLD_PX) return;
        this.gesture = { ...gesture, kind: 'body' };
        this.dragBody(this.gesture, input.world);
        break;
      case 'body':
        this.dragBody(gesture, input.world);
        break;
      case 'pendingDraw':
        if (travelled < DRAW_THRESHOLD_PX) return;
        this.gesture = { kind: 'draw', down: gesture.down, start: gesture.start };
        this.dragDraw(this.gesture, input.world);
        break;
      case 'draw':
        this.dragDraw(gesture, input.world);
        break;
    }
  }

  pointerUp(input: PointerInput): void {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return;

    switch (gesture.kind) {
      case 'vertex':
      case 'body':
        this.commit();
        break;
      case 'pendingDraw':
        // A Ctrl/Cmd click on an edge adds a vertex; on a vertex or empty space it does nothing.
        if (gesture.start.on === 'edge' && gesture.edge) {
          const added = insertVertex(this.graph, gesture.edge, gesture.start.at);
          if (added) {
            this.selection = { kind: 'vertex', at: added };
            this.commit();
          }
        }
        break;
      case 'draw': {
        const plan = planNewEdge(this.graph, gesture.start, input.world, this.scale);
        if (commitNewEdge(this.graph, plan)) this.commit();
        break;
      }
      default:
        break;
    }

    this.ring = null;
    this.preview = null;
    this.hoverKey = '';
    this.updateHover(input);
    this.notify();
  }

  /** The primary button went down and up on empty space without panning. */
  clickEmpty(): void {
    this.selection = { kind: 'none' };
    this.notify();
  }

  /** Double click: narrow a body selection to the edge under the pointer. */
  doubleClick(input: PointerInput): void {
    if (input.space || input.mod) return;
    const hit = hitTest(this.graph, input.world, this.scale, { ghosts: false });
    if (hit.kind !== 'body') return;
    this.selection = { kind: 'body', scope: 'edge', edges: [hit.edge] };
    this.notify();
  }

  /** Right-click (or the context-menu gesture). Deletes the vertex under the pointer. */
  contextMenu(input: PointerInput): void {
    if (input.mod || this.gesture) return;
    const hit = hitTest(this.graph, input.world, this.scale, { ghosts: false });
    if (hit.kind !== 'vertex') return;
    this.deleteVertex(hit.at);
  }

  pointerCancel(): void {
    this.cancelGesture();
  }

  /** The pointer left the canvas: drop hover feedback. */
  pointerLeave(): void {
    if (this.gesture) return;
    this.hover = NO_HOVER;
    this.ghost = null;
    this.cursor = 'default';
    this.hoverKey = '';
    this.notify();
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  /** Returns true when the key was an editor shortcut, so the caller can stop the browser acting on it. */
  keyDown(input: KeyInput): boolean {
    const key = input.key.toLowerCase();

    if (input.key === 'Escape') {
      if (this.confirm) {
        this.confirm = null;
        this.notify();
      } else if (this.gesture) {
        this.cancelGesture();
      } else {
        this.selection = { kind: 'none' };
        this.notify();
      }
      return true;
    }

    if (this.gesture || this.confirm) return false;

    if (input.mod && key === 'z') {
      if (input.shift) this.redo();
      else this.undo();
      return true;
    }
    if (input.mod && key === 'y') {
      this.redo();
      return true;
    }
    if (input.mod && key === 'a') {
      this.selectAll();
      return true;
    }
    if (input.key === 'Delete' || input.key === 'Backspace') {
      return this.deleteSelection();
    }
    return false;
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  undo(): void {
    const state = this.history.undo();
    if (state !== null) this.load(state);
  }

  redo(): void {
    const state = this.history.redo();
    if (state !== null) this.load(state);
  }

  /** Back to the graph the editor was created with. */
  reset(): void {
    this.history.push(this.initial);
    this.load(this.initial);
  }

  /** The user confirmed the "Delete all edges?" dialog. */
  confirmDeleteAll(): void {
    if (this.confirm !== 'deleteAll') return;
    this.confirm = null;
    removeEdges(this.graph, this.graph.getEdges());
    this.touch();
    this.selection = { kind: 'none' };
    this.commit();
    this.notify();
  }

  cancelConfirm(): void {
    if (this.confirm === null) return;
    this.confirm = null;
    this.notify();
  }

  // ─── Gesture steps ────────────────────────────────────────────────────────

  private pressGhost(edge: NxEdge, at: NxPoint, world: NxPoint): 'claimed' | 'empty' {
    const cancelTo = this.serialize();
    const added = insertVertex(this.graph, edge, at);
    if (!added) return 'empty';
    this.touch();
    this.selection = { kind: 'vertex', at: added };
    // The new vertex is dragged straight away; Esc undoes the insertion as well.
    this.gesture = { kind: 'vertex', down: world, start: added, base: this.serialize(), cancelTo };
    this.notify();
    return 'claimed';
  }

  private pressBody(edge: NxEdge, at: NxPoint, world: NxPoint): 'claimed' {
    const run = this.runIndex().get(edgeKey(this.graph, edge));
    const keepEdge =
      this.selection.kind === 'body' &&
      this.selection.scope === 'edge' &&
      this.selection.edges.some((selected) => sameEdge(this.graph, selected, edge));
    const scope: Scope = keepEdge ? 'edge' : 'run';

    const edges = scope === 'edge' || !run ? [edge] : run.edges;
    const nodes = scope === 'edge' || !run ? [edge[0], edge[1]] : run.nodes;
    const axis = scope === 'edge' || !run ? edge : run.axis;
    const normal = perp(unit(sub(axis[1], axis[0])));

    this.selection = { kind: 'body', scope, edges };
    this.gesture = {
      kind: 'pendingBody',
      down: world,
      base: this.serialize(),
      slide: { nodes, anchor: at, normal, edges, scope },
    };
    this.notify();
    return 'claimed';
  }

  private dragVertex(gesture: Extract<Gesture, { kind: 'vertex' }>, world: NxPoint): void {
    this.restore(gesture.base);
    const candidate = add(gesture.start, sub(world, gesture.down));
    const result = moveVertex(this.graph, gesture.start, candidate, this.scale);
    this.selection = { kind: 'vertex', at: result.final };
    this.ring = result.ring;
    this.touch();
    this.notify();
  }

  private dragBody(gesture: Extract<Gesture, { kind: 'body' }>, world: NxPoint): void {
    this.restore(gesture.base);
    const { slide } = gesture;
    const result = slideAlongNormal(this.graph, slide.nodes, {
      anchor: slide.anchor,
      normal: slide.normal,
      down: gesture.down,
      pointer: world,
      scale: this.scale,
    });
    this.selection = {
      kind: 'body',
      scope: slide.scope,
      edges: remapEdges(this.graph, slide.edges, result.moved),
    };
    this.ring = result.ring;
    this.touch();
    this.notify();
  }

  private dragDraw(gesture: Extract<Gesture, { kind: 'draw' }>, world: NxPoint): void {
    const plan = planNewEdge(this.graph, gesture.start, world, this.scale);
    this.preview = plan;
    this.ring = plan.end ? { at: plan.end.point, kind: 'snap' } : null;
    this.notify();
  }

  private cancelGesture(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    if (gesture.kind === 'vertex') this.restore(gesture.cancelTo);
    else if (gesture.kind === 'body') this.restore(gesture.base);
    this.selection = { kind: 'none' };
    this.ring = null;
    this.preview = null;
    this.notify();
  }

  // ─── Selection and deletion ───────────────────────────────────────────────

  private selectAll(): void {
    if (this.selection.kind !== 'body') return;
    this.selection = { kind: 'body', scope: 'all', edges: this.graph.getEdges() };
    this.notify();
  }

  private deleteSelection(): boolean {
    const selection = this.selection;
    if (selection.kind === 'vertex') {
      this.deleteVertex(selection.at);
      return true;
    }
    if (selection.kind !== 'body') return false;

    if (selection.scope === 'all') {
      this.confirm = 'deleteAll';
      this.notify();
      return true;
    }
    removeEdges(this.graph, selection.edges);
    this.touch();
    this.selection = { kind: 'none' };
    this.commit();
    this.notify();
    return true;
  }

  private deleteVertex(at: NxPoint): void {
    const result = removeVertex(this.graph, at);
    if (!result.removed) {
      this.say(result.reason);
      this.notify();
      return;
    }
    this.touch();
    this.selection = { kind: 'none' };
    this.commit();
    this.notify();
  }

  // ─── Hover ────────────────────────────────────────────────────────────────

  private updateHover(input: PointerInput): void {
    if (input.space) return;
    const hit = hitTest(this.graph, input.world, this.scale, { ghosts: !input.mod });
    const ghost = input.mod
      ? null
      : hit.kind === 'ghost'
        ? { edge: hit.edge, at: hit.at }
        : hit.kind === 'vertex'
          ? null
          : findGhost(this.graph, input.world, this.scale, GHOST_SHOW_PX);
    const cursor = this.cursorFor(hit, input.mod);

    const key = JSON.stringify([hit, ghost?.at ?? null, cursor]);
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.hover = hit;
    this.ghost = ghost;
    this.cursor = cursor;
    this.notify();
  }

  /** The cursor that tells the user which gesture a press here would start. */
  private cursorFor(hit: Hit, mod: boolean): string {
    if (mod) return 'crosshair';
    switch (hit.kind) {
      case 'vertex':
        return 'move';
      case 'ghost':
        return 'copy';
      case 'body': {
        const run = this.runIndex().get(edgeKey(this.graph, hit.edge));
        const axis = run?.axis ?? hit.edge;
        const normal = perp(unit(sub(axis[1], axis[0])));
        // Eighths of a turn, folded to a line: 0 horizontal, 2 vertical (y points down).
        const step = Math.round(Math.atan2(normal[1], normal[0]) / (Math.PI / 4));
        return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][((step % 4) + 4) % 4]!;
      }
      default:
        return 'default';
    }
  }

  // ─── Graph state ──────────────────────────────────────────────────────────

  private serialize(): string {
    return JSON.stringify(this.graph.export());
  }

  /** Replace the graph's contents. A string is used so no attribute object is shared with history. */
  private restore(state: string): void {
    this.graph.clear();
    this.graph.import(JSON.parse(state));
    this.touch();
  }

  private load(state: string): void {
    this.restore(state);
    this.selection = { kind: 'none' };
    this.ring = null;
    this.preview = null;
    this.hoverKey = '';
    this.notify();
  }

  /**
   * Record the graph as one history step, if it differs from the last one. Every
   * commit follows a mutation, so this is also where the view is told the graph changed.
   */
  private commit(): void {
    this.touch();
    this.history.push(this.serialize());
  }

  private touch(): void {
    this.graphRev += 1;
    this.runCache = null;
    // What was under the pointer may be gone; the next pointer move works it out again.
    this.hover = NO_HOVER;
    this.ghost = null;
    this.cursor = 'default';
    this.hoverKey = '';
  }

  private runIndex(): Map<string, Run> {
    return this.runs().index;
  }

  private runs() {
    if (!this.runCache || this.runCache.rev !== this.graphRev) {
      const runs = detectRuns(this.graph);
      this.runCache = { rev: this.graphRev, runs, index: indexRuns(this.graph, runs) };
    }
    return this.runCache;
  }

  private say(text: string): void {
    this.messageId += 1;
    this.message = { id: this.messageId, text };
  }

  private makeView(): View {
    const { runs, index } = this.runs();
    let hoverEdges: NxEdge[] = [];
    if (this.hover.kind === 'body') {
      hoverEdges = index.get(edgeKey(this.graph, this.hover.edge))?.edges ?? [this.hover.edge];
      const selected = this.selection.kind === 'body' ? this.selection.edges : [];
      // Hovering something already selected adds no hover layer: selection wins.
      if (hoverEdges.every((edge) => selected.some((s) => sameEdge(this.graph, s, edge)))) {
        hoverEdges = [];
      }
    }
    return {
      graphRev: this.graphRev,
      hover: this.hover,
      hoverEdges,
      ghost: this.ghost,
      selection: this.selection,
      ring: this.ring,
      preview: this.preview,
      confirm: this.confirm,
      cursor: this.gesture ? this.gestureCursor(this.gesture) : this.cursor,
      message: this.message,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      stats: { nodes: this.graph.order, edges: this.graph.size, runs: runs.length },
    };
  }

  private gestureCursor(gesture: Gesture): string {
    switch (gesture.kind) {
      case 'draw':
      case 'pendingDraw':
        return 'crosshair';
      case 'vertex':
        return 'move';
      case 'body':
        return this.cursor === 'default' ? 'move' : this.cursor;
      default:
        return this.cursor;
    }
  }

  private notify(): void {
    this.view = this.makeView();
    for (const listener of this.listeners) listener(this.view);
  }
}
