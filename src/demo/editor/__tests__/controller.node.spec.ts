import { beforeEach, describe, expect, it } from 'vitest';
import type { NxPoint } from '@flatten-js/spatial-graph';
import { EditorController, type PointerInput } from '../controller.js';
import { createSampleGraph, graphFromEdges } from '../sample.js';

const at = (x: number, y: number, mod = false): PointerInput => ({ world: [x, y], mod });
const key = (k: string, mod = false, shift = false) => ({ key: k, mod, shift });

/**
 * A T: a spine A-B-C and a stem B-D, all width 140.
 *
 *   A(0,0) ---- B(400,0) ---- C(800,0)
 *                  |
 *               D(400,300)
 */
const tee = () =>
  graphFromEdges([
    [[0, 0], [400, 0], 140],
    [[400, 0], [800, 0], 140],
    [[400, 0], [400, 300], 140],
  ]);

function drag(c: EditorController, from: NxPoint, to: NxPoint, mod = false): void {
  c.pointerDown(at(from[0], from[1], mod));
  c.pointerMove(at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, mod));
  c.pointerMove(at(to[0], to[1], mod));
  c.pointerUp(at(to[0], to[1], mod));
}

describe('EditorController', () => {
  let c: EditorController;
  beforeEach(() => {
    c = new EditorController(tee());
  });

  describe('vertex', () => {
    it('drags a vertex and the edges follow', () => {
      drag(c, [800, 0], [800, 150]);
      expect(c.graph.hasPointNode([800, 150])).toBe(true);
      expect(c.graph.hasPointNode([800, 0])).toBe(false);
      expect(c.view.selection).toEqual({ kind: 'vertex', at: [800, 150] });
      expect(c.view.canUndo).toBe(true);
    });

    it('a click selects without changing the graph', () => {
      c.pointerDown(at(800, 0));
      c.pointerUp(at(800, 0));
      expect(c.view.selection).toEqual({ kind: 'vertex', at: [800, 0] });
      expect(c.view.canUndo).toBe(false);
    });

    it('does not start a drag below the threshold', () => {
      c.pointerDown(at(800, 0));
      c.pointerMove(at(802, 0));
      c.pointerUp(at(802, 0));
      expect(c.graph.hasPointNode([800, 0])).toBe(true);
    });

    it('Escape mid-drag restores the graph exactly', () => {
      const before = JSON.stringify(c.graph.export().nodes.map((n) => n.key).sort());
      c.pointerDown(at(800, 0));
      c.pointerMove(at(800, 100));
      c.pointerMove(at(900, 200));
      expect(c.graph.hasPointNode([900, 200])).toBe(true);
      c.keyDown(key('Escape'));
      c.pointerUp(at(900, 200));
      expect(JSON.stringify(c.graph.export().nodes.map((n) => n.key).sort())).toBe(before);
      expect(c.view.canUndo).toBe(false);
    });

    it('replays from the start, so there is no drift', () => {
      c.pointerDown(at(800, 0));
      for (let y = 5; y <= 100; y += 5) c.pointerMove(at(800, y));
      c.pointerMove(at(800, 40));
      c.pointerUp(at(800, 40));
      expect(c.graph.getNodes().map((n) => n.join(',')).sort()).toEqual(
        ['0,0', '400,0', '400,300', '800,40'].sort(),
      );
    });

    it('collapses into a vertex it is dropped on', () => {
      drag(c, [400, 300], [803, 3]);
      expect(c.graph.hasPointNode([400, 300])).toBe(false);
      expect(c.graph.size).toBe(2);
    });

    it('shows the ring while dragging near a target, and not after', () => {
      c.pointerDown(at(400, 300));
      c.pointerMove(at(600, 200));
      c.pointerMove(at(802, 4));
      expect(c.view.ring).toEqual({ at: [800, 0], kind: 'collapse' });
      c.pointerUp(at(802, 4));
      expect(c.view.ring).toBeNull();
    });

    it('splits an edge it is dropped on and connects', () => {
      const g = graphFromEdges([
        [[0, 0], [800, 0], 140],
        [[400, 300], [400, 500], 140],
      ]);
      const ctl = new EditorController(g);
      drag(ctl, [400, 300], [400, 5]);
      expect(g.getPointDegree([400, 0])).toBe(3);
      expect(g.hasPointNode([400, 300])).toBe(false);
    });

    it('undoes and redoes a drag', () => {
      drag(c, [800, 0], [800, 150]);
      c.undo();
      expect(c.graph.hasPointNode([800, 0])).toBe(true);
      expect(c.graph.hasPointNode([800, 150])).toBe(false);
      c.redo();
      expect(c.graph.hasPointNode([800, 150])).toBe(true);
    });
  });

  describe('insertion ghost', () => {
    it('shows when the pointer nears an edge midpoint', () => {
      c.pointerMove(at(200, 20));
      expect(c.view.ghost?.at).toEqual([200, 0]);
      c.pointerMove(at(200, 120));
      expect(c.view.ghost).toBeNull();
    });

    it('inserts a vertex and drags it straight away', () => {
      c.pointerDown(at(200, 0));
      c.pointerMove(at(200, 40));
      c.pointerMove(at(200, 80));
      c.pointerUp(at(200, 80));
      expect(c.graph.hasPointNode([200, 80])).toBe(true);
      expect(c.graph.hasPointNode([200, 0])).toBe(false);
      expect(c.graph.size).toBe(4);
    });

    it('a click on the ghost just adds the vertex', () => {
      c.pointerDown(at(200, 0));
      c.pointerUp(at(200, 0));
      expect(c.graph.hasPointNode([200, 0])).toBe(true);
      expect(c.view.selection).toEqual({ kind: 'vertex', at: [200, 0] });
    });

    it('Escape removes the vertex it inserted', () => {
      c.pointerDown(at(200, 0));
      c.pointerMove(at(200, 60));
      c.keyDown(key('Escape'));
      expect(c.graph.hasPointNode([200, 0])).toBe(false);
      expect(c.graph.hasPointNode([200, 60])).toBe(false);
      expect(c.graph.size).toBe(3);
    });
  });

  describe('Ctrl/Cmd', () => {
    it('click on an edge adds a vertex there', () => {
      c.pointerDown(at(120, 4, true));
      c.pointerUp(at(120, 4, true));
      expect(c.graph.hasPointNode([120, 0])).toBe(true);
      expect(c.view.selection).toEqual({ kind: 'vertex', at: [120, 0] });
    });

    it('click on a vertex does nothing', () => {
      c.pointerDown(at(400, 0, true));
      c.pointerUp(at(400, 0, true));
      expect(c.graph.size).toBe(3);
      expect(c.view.canUndo).toBe(false);
    });

    it('drag from a vertex draws an edge with that vertex width', () => {
      drag(c, [800, 0], [800, 300], true);
      expect(c.graph.getPointDegree([800, 0])).toBe(2);
      expect(c.graph.hasPointNode([800, 300])).toBe(true);
      expect(c.graph.getEdgeAttributesFor([[800, 0], [800, 300]])?.width).toBe(140);
    });

    it('drag from empty space draws a free edge of the default width', () => {
      drag(c, [1000, 400], [1000, 700], true);
      expect(c.graph.getEdgeAttributesFor([[1000, 400], [1000, 700]])?.width).toBe(140);
    });

    it('drag across an edge splits it and chains', () => {
      drag(c, [200, -300], [200, 300], true);
      expect(c.graph.getPointDegree([200, 0])).toBe(4);
    });

    it('previews while dragging and changes nothing until release', () => {
      c.pointerDown(at(1000, 400, true));
      c.pointerMove(at(1000, 500, true));
      c.pointerMove(at(1000, 700, true));
      expect(c.view.preview?.valid).toBe(true);
      expect(c.graph.size).toBe(3);
      c.keyDown(key('Escape'));
      expect(c.view.preview).toBeNull();
      c.pointerUp(at(1000, 700, true));
      expect(c.graph.size).toBe(3);
    });

    it('a too-short drag adds nothing', () => {
      drag(c, [1000, 400], [1004, 400], true);
      expect(c.graph.size).toBe(3);
    });
  });

  describe('view revision', () => {
    // The view layer redraws only when graphRev moves, so every committed edit must move it.
    const revAfter = (act: () => void): number => {
      const before = c.view.graphRev;
      act();
      return c.view.graphRev - before;
    };

    it('moves after a drawn edge', () => {
      expect(revAfter(() => drag(c, [200, -300], [200, 300], true))).toBeGreaterThan(0);
      // and the run cache is fresh: the spine is now split at the crossing
      c.pointerMove(at(100, 30));
      expect(c.view.hoverEdges.length).toBeGreaterThan(0);
    });

    it('moves after a Ctrl/Cmd click inserts a vertex', () => {
      expect(
        revAfter(() => {
          c.pointerDown(at(120, 4, true));
          c.pointerUp(at(120, 4, true));
        }),
      ).toBeGreaterThan(0);
    });

    it('moves after undo, redo and reset', () => {
      drag(c, [800, 0], [800, 150]);
      expect(revAfter(() => c.undo())).toBeGreaterThan(0);
      expect(revAfter(() => c.redo())).toBeGreaterThan(0);
      expect(revAfter(() => c.reset())).toBeGreaterThan(0);
    });

    it('moves after each kind of delete', () => {
      expect(revAfter(() => c.contextMenu(at(800, 0)))).toBeGreaterThan(0);
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      expect(revAfter(() => c.keyDown(key('Delete')))).toBeGreaterThan(0);
    });

    it('drops hover feedback for things the edit removed', () => {
      c.pointerMove(at(100, 30));
      expect(c.view.hoverEdges.length).toBeGreaterThan(0);
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      c.keyDown(key('a', true));
      c.keyDown(key('Delete'));
      c.confirmDeleteAll();
      expect(c.view.hover).toEqual({ kind: 'empty' });
      expect(c.view.hoverEdges).toEqual([]);
      c.undo();
      expect(c.view.hoverEdges).toEqual([]);
    });

    it('detects runs on the edited graph, not the previous one', () => {
      // Add a vertex on the spine: the spine is still one run, now of three edges.
      c.pointerDown(at(120, 4, true));
      c.pointerUp(at(120, 4, true));
      c.pointerDown(at(600, 30));
      c.pointerUp(at(600, 30));
      expect(c.view.selection.kind === 'body' && c.view.selection.edges).toHaveLength(3);
    });
  });

  describe('body', () => {
    it('a click selects the whole run', () => {
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      expect(c.view.selection).toMatchObject({ kind: 'body', scope: 'run' });
      expect(c.view.selection.kind === 'body' && c.view.selection.edges).toHaveLength(2);
    });

    it('a double click narrows to one edge', () => {
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      c.doubleClick(at(100, 30));
      expect(c.view.selection).toMatchObject({ kind: 'body', scope: 'edge' });
      expect(c.view.selection.kind === 'body' && c.view.selection.edges).toHaveLength(1);
    });

    it('a drag slides the run perpendicular to its axis', () => {
      drag(c, [100, 30], [160, 130]);
      // 100 down, whatever the sideways drift of the pointer
      expect(c.graph.hasPointNode([0, 100])).toBe(true);
      expect(c.graph.hasPointNode([400, 100])).toBe(true);
      expect(c.graph.hasPointNode([800, 100])).toBe(true);
      // the stem stretches to follow
      expect(c.graph.hasPointNode([400, 300])).toBe(true);
      expect(c.graph.getPointDegree([400, 100])).toBe(3);
      expect(c.view.selection).toMatchObject({ kind: 'body', scope: 'run' });
    });

    it('an edge-scope drag moves only that edge', () => {
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      c.doubleClick(at(100, 30));
      drag(c, [100, 30], [100, 130]);
      expect(c.graph.hasPointNode([0, 100])).toBe(true);
      expect(c.graph.hasPointNode([400, 100])).toBe(true);
      expect(c.graph.hasPointNode([800, 0])).toBe(true);
      expect(c.view.selection).toMatchObject({ scope: 'edge' });
    });

    it('outlines the hovered run, but not once it is selected', () => {
      c.pointerMove(at(100, 30));
      expect(c.view.hoverEdges).toHaveLength(2);
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      c.pointerMove(at(110, 30));
      expect(c.view.hoverEdges).toHaveLength(0);
    });

    it('reports a resize cursor along the normal', () => {
      c.pointerMove(at(100, 30));
      expect(c.view.cursor).toBe('ns-resize');
      c.pointerMove(at(410, 100));
      expect(c.view.cursor).toBe('ew-resize');
    });
  });

  describe('delete', () => {
    it('deletes a selected run and prunes what it leaves isolated', () => {
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      expect(c.keyDown(key('Delete'))).toBe(true);
      expect(c.graph.size).toBe(1);
      expect(c.graph.hasPointNode([0, 0])).toBe(false);
      expect(c.graph.hasPointNode([800, 0])).toBe(false);
    });

    it('deletes one edge at edge scope', () => {
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      c.doubleClick(at(100, 30));
      c.keyDown(key('Backspace'));
      expect(c.graph.size).toBe(2);
      expect(c.graph.hasPointNode([0, 0])).toBe(false);
    });

    it('asks before deleting every edge, then clears the graph', () => {
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      c.keyDown(key('a', true));
      expect(c.view.selection).toMatchObject({ kind: 'body', scope: 'all' });
      c.keyDown(key('Delete'));
      expect(c.view.confirm).toBe('deleteAll');
      expect(c.graph.size).toBe(3);

      c.confirmDeleteAll();
      expect(c.graph.size).toBe(0);
      expect(c.graph.order).toBe(0);
      c.undo();
      expect(c.graph.size).toBe(3);
    });

    it('Cancel and Escape keep everything', () => {
      c.pointerDown(at(100, 30));
      c.pointerUp(at(100, 30));
      c.keyDown(key('a', true));
      c.keyDown(key('Delete'));
      c.keyDown(key('Escape'));
      expect(c.view.confirm).toBeNull();
      expect(c.graph.size).toBe(3);
      expect(c.view.selection).toMatchObject({ scope: 'all' });
    });

    it('Mod+A does nothing without a body selection', () => {
      c.keyDown(key('a', true));
      expect(c.view.selection).toEqual({ kind: 'none' });
    });

    it('deletes a selected dead-end vertex', () => {
      c.pointerDown(at(400, 300));
      c.pointerUp(at(400, 300));
      c.keyDown(key('Delete'));
      expect(c.graph.hasPointNode([400, 300])).toBe(false);
      expect(c.graph.size).toBe(2);
    });

    it('right-click deletes the vertex under the pointer', () => {
      c.contextMenu(at(800, 0));
      expect(c.graph.hasPointNode([800, 0])).toBe(false);
    });

    it('ignores the context menu when Ctrl is held (macOS Ctrl+click)', () => {
      c.contextMenu(at(800, 0, true));
      expect(c.graph.hasPointNode([800, 0])).toBe(true);
    });

    it('refuses a junction with a message and changes nothing', () => {
      c.pointerDown(at(400, 0));
      c.pointerUp(at(400, 0));
      c.keyDown(key('Delete'));
      expect(c.graph.size).toBe(3);
      expect(c.view.message?.text).toContain('joins 3 edges');
    });
  });

  describe('history and selection', () => {
    it('Mod+Z and Mod+Shift+Z undo and redo', () => {
      drag(c, [800, 0], [800, 150]);
      c.keyDown(key('z', true));
      expect(c.graph.hasPointNode([800, 0])).toBe(true);
      c.keyDown(key('z', true, true));
      expect(c.graph.hasPointNode([800, 150])).toBe(true);
    });

    it('reset returns to the starting graph as one undoable step', () => {
      drag(c, [800, 0], [800, 150]);
      c.reset();
      expect(c.graph.hasPointNode([800, 0])).toBe(true);
      c.undo();
      expect(c.graph.hasPointNode([800, 150])).toBe(true);
    });

    it('clicking empty space clears the selection', () => {
      c.pointerDown(at(800, 0));
      c.pointerUp(at(800, 0));
      expect(c.pointerDown(at(1200, 900))).toBe('empty');
      c.clickEmpty();
      expect(c.view.selection).toEqual({ kind: 'none' });
    });

    it('stands aside while Space is held', () => {
      expect(c.pointerDown({ world: [800, 0], mod: false, space: true })).toBe('ignored');
      expect(c.pointerDown({ world: [800, 0], mod: false, button: 1 })).toBe('ignored');
    });

    it('notifies subscribers with a fresh view', () => {
      const seen: unknown[] = [];
      const off = c.subscribe((view) => seen.push(view));
      c.pointerMove(at(100, 30));
      off();
      c.pointerMove(at(400, 150));
      expect(seen).toHaveLength(1);
    });
  });

  it('works on the sample graph', () => {
    const sample = new EditorController(createSampleGraph());
    expect(sample.view.stats.nodes).toBeGreaterThan(8);
    // The spine and the vertical both pass through the junction at [700, 450].
    sample.pointerDown(at(500, 480));
    sample.pointerUp(at(500, 480));
    const selection = sample.view.selection;
    expect(selection.kind === 'body' && selection.edges.length).toBe(5);
  });
});
