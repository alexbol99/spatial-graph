import type { NxEdge, NxPoint } from '@flatten-js/spatial-graph';

/** A maximal chain of edges that are collinear and share one width. */
export type Run = {
  edges: NxEdge[];
  /** Nodes along the chain, end to end when the chain is open. */
  nodes: NxPoint[];
  width: number;
  /** First node to last node; the direction a run moves perpendicular to. */
  axis: NxEdge;
};

/** What a body selection covers: one run, one edge, or every edge. */
export type Scope = 'run' | 'edge' | 'all';

export type Selection =
  | { kind: 'none' }
  | { kind: 'vertex'; at: NxPoint }
  | { kind: 'body'; scope: Scope; edges: NxEdge[] };

export type Hit =
  | { kind: 'vertex'; at: NxPoint }
  | { kind: 'ghost'; edge: NxEdge; at: NxPoint }
  | { kind: 'body'; edge: NxEdge; at: NxPoint }
  | { kind: 'empty' };

export type Ghost = { edge: NxEdge; at: NxPoint };

/** The transient ring shown where a drag is snapping. */
export type Ring = { at: NxPoint; kind: 'snap' | 'collapse' };
