import { describe, expect, it } from 'vitest';
import { computeScaledDimensions } from '../src/client/scale';

describe('scale utilities', () => {
  it('returns original size when below max', () => {
    expect(computeScaledDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it('scales longer side down to max dimension', () => {
    expect(computeScaledDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it('handles square images gracefully', () => {
    expect(computeScaledDimensions(5000, 5000, 2500)).toEqual({ width: 2500, height: 2500 });
  });
});
