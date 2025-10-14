import { describe, expect, it } from 'vitest';
import { parsePageSelection } from '../src/client/pages';

describe('page selection parsing', () => {
  it('returns all pages when mode is all', () => {
    expect(parsePageSelection(3, 'all', '')).toEqual([0, 1, 2]);
  });

  it('parses comma-separated values and ranges', () => {
    expect(parsePageSelection(10, 'custom', '1,3-5')).toEqual([0, 2, 3, 4]);
  });

  it('ignores invalid tokens and clamps to bounds', () => {
    expect(parsePageSelection(3, 'custom', '0,20,2')).toEqual([1]);
  });

  it('falls back to all pages when nothing valid is provided', () => {
    expect(parsePageSelection(2, 'custom', 'abc')).toEqual([0, 1]);
  });
});
