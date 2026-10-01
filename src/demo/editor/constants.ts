// World units play the role of centimetres in the editor this demo is ported from.
// Everything suffixed `_PX` is screen pixels and is divided by the zoom scale before use.

/** Width of an edge drawn from empty space. Width is not editable; edges inherit it. */
export const DEFAULT_WIDTH = 140;

/** Two edges continue each other when the angle between them is within this of 180 degrees. */
export const RUN_ANGLE_TOLERANCE_DEG = 3;
/** ...and their widths differ by at most this. */
export const RUN_WIDTH_TOLERANCE = 0.5;

/** A drawn edge shorter than this is discarded. */
export const MIN_NEW_EDGE_LENGTH = 10;
/** Slack for "this point lies on that edge" after coordinates are rounded to the grid. */
export const ON_EDGE_TOLERANCE = 1;

export const VERTEX_RADIUS_PX = 9;
export const GHOST_RADIUS_PX = 8;
/** The ghost appears while the pointer is within this of it. */
export const GHOST_SHOW_PX = 28;
/** A ghost is only offered on a stretch at least this long on screen. */
export const GHOST_MIN_SPAN_PX = 44;
/** A body is at least this thick to hit, however narrow its width. */
export const BODY_MIN_HIT_PX = 6;

export const VERTEX_SNAP_TOL_PX = 12;
export const EDGE_SNAP_TOL_PX = 10;

/** Pointer travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;
/** ...and before a Ctrl/Cmd press becomes a drawn edge. */
export const DRAW_THRESHOLD_PX = 6;

export const HISTORY_LIMIT = 100;
