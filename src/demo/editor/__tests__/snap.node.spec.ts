import { describe, expect, it } from 'vitest';
import { snapToGraph } from '../snap.js';
import { graphFromEdges } from '../sample.js';
import { edgeKey } from '../util.js';

const graph = () =>
  graphFromEdges([
    [[0, 0], [400, 0], 100],
    [[0, 100], [0, 400], 100],
  ]);

describe('snapToGraph', () => {
  it('snaps to a vertex within reach', () => {
    expect(snapToGraph(graph(), [5, 4], { vertexTol: 12, edgeTol: 10 })).toEqual({
      kind: 'vertex',
      point: [0, 0],
    });
  });

  it('prefers a vertex over an edge', () => {
    // 6 from the vertex at [0, 0] and 6 from the edge it ends.
    const snap = snapToGraph(graph(), [6, 6], { vertexTol: 12, edgeTol: 10 });
    expect(snap?.kind).toBe('vertex');
  });

  it('snaps to the foot of the perpendicular on an edge interior', () => {
    const snap = snapToGraph(graph(), [200, 7], { vertexTol: 12, edgeTol: 10 });
    expect(snap).toMatchObject({ kind: 'edge', point: [200, 0] });
  });

  it('does not snap to an edge past its end', () => {
    expect(snapToGraph(graph(), [430, 4], { vertexTol: 12, edgeTol: 10 })).toBeNull();
  });

  it('does not snap beyond its reach', () => {
    expect(snapToGraph(graph(), [200, 30], { vertexTol: 12, edgeTol: 10 })).toBeNull();
  });

  it('skips excluded nodes and edges', () => {
    const g = graph();
    const horizontal = edgeKey(g, [[0, 0], [400, 0]]);
    const snap = snapToGraph(g, [200, 7], {
      vertexTol: 12,
      edgeTol: 10,
      excludeEdges: new Set([horizontal]),
    });
    expect(snap).toBeNull();

    const vertex = snapToGraph(g, [3, 3], {
      vertexTol: 12,
      edgeTol: 0,
      excludeNodes: new Set([g.getPointKey([0, 0])]),
    });
    expect(vertex).toBeNull();
  });
});
