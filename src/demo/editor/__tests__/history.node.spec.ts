import { describe, expect, it } from 'vitest';
import { History } from '../history.js';

describe('History', () => {
  it('undoes and redoes', () => {
    const h = new History('a');
    h.push('b');
    h.push('c');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
  });

  it('ignores a state equal to the current one', () => {
    const h = new History('a');
    expect(h.push('a')).toBe(false);
    expect(h.canUndo).toBe(false);
  });

  it('drops redo on a new push', () => {
    const h = new History('a');
    h.push('b');
    h.undo();
    h.push('c');
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('a');
  });
});
