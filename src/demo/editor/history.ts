import { HISTORY_LIMIT } from './constants.js';

/** A linear undo/redo stack of snapshots. `current` is the state on screen. */
export class History<T> {
  private states: T[];
  private index = 0;

  constructor(initial: T) {
    this.states = [initial];
  }

  get current(): T {
    return this.states[this.index]!;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1;
  }

  /** Record a new state, dropping any redo. Returns false when it equals the current one. */
  push(state: T): boolean {
    if (state === this.current) return false;
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(state);
    if (this.states.length > HISTORY_LIMIT) this.states.shift();
    this.index = this.states.length - 1;
    return true;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.current;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.current;
  }

  reset(initial: T): void {
    this.states = [initial];
    this.index = 0;
  }
}
