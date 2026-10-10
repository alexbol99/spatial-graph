import type { CoordinatePrecision, Point2D } from '../types.js';

export function validatePrecision(precision: CoordinatePrecision): void {
  if (precision !== null && (!Number.isInteger(precision) || precision < 0 || precision > 15)) {
    throw new RangeError('coordinatePrecision must be null or an integer from 0 to 15.');
  }
}

/** Normalize a graph coordinate, rejecting values that cannot be represented. */
export function canonicalPoint(point: Point2D, precision: CoordinatePrecision): Point2D {
  const [x, y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('Point coordinates must be finite numbers; pass a finite [x, y] tuple.');
  }
  if (precision === null) return [x === 0 ? 0 : x, y === 0 ? 0 : y];

  const factor = 10 ** precision;
  const scaledX = x * factor;
  const scaledY = y * factor;
  if (!Number.isFinite(scaledX) || !Number.isFinite(scaledY)) {
    throw new RangeError('Point cannot be quantized at coordinatePrecision; use smaller coordinates or a lower precision.');
  }
  const nx = Math.round(scaledX) / factor;
  const ny = Math.round(scaledY) / factor;
  return [nx === 0 ? 0 : nx, ny === 0 ? 0 : ny];
}

/** Build a key only from canonical coordinates. */
export function pointKey(point: Point2D): string {
  return `${point[0]},${point[1]}`;
}
