import { describe, expect, it } from 'vitest';
import { map16To8Value, map16BufferTo8, cmykToRgb, toRGBA } from '../src/client/color';

describe('color utilities', () => {
  it('maps 16-bit values with gamma compression', () => {
    expect(map16To8Value(0)).toBe(0);
    expect(map16To8Value(65535)).toBe(255);
    expect(map16To8Value(32768)).toBeGreaterThan(128);
  });

  it('maps an entire 16-bit buffer', () => {
    const input = new Uint16Array([0, 65535]);
    const output = map16BufferTo8(input);
    expect(Array.from(output)).toEqual([0, 255]);
  });

  it('converts CMYK to RGB in sRGB space', () => {
    const [r, g, b] = cmykToRgb(0, 0, 0, 0, 8);
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);

    const [r2, g2, b2] = cmykToRgb(255, 255, 255, 255, 8);
    expect(r2).toBe(0);
    expect(g2).toBe(0);
    expect(b2).toBe(0);
  });

  it('converts grayscale arrays to RGBA', () => {
    const rgba = toRGBA(new Uint8Array([0, 255]), { colorSpace: 'GRAY', bitDepth: 8, samplesPerPixel: 1 });
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
});
