import type { ColorSpace } from './tiff-adapter';

const GAMMA = 1 / 2.2;

export function map16To8Value(value: number): number {
  const normalized = Math.max(0, Math.min(65535, value)) / 65535;
  const corrected = Math.pow(normalized, GAMMA);
  return Math.round(corrected * 255);
}

export function map16BufferTo8(buffer: Uint16Array): Uint8Array {
  const out = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    out[i] = map16To8Value(buffer[i]);
  }
  return out;
}

export function cmykToRgb(c: number, m: number, y: number, k: number, bitDepth: 8 | 16): [number, number, number] {
  const maxValue = bitDepth === 16 ? 65535 : 255;
  const C = c / maxValue;
  const M = m / maxValue;
  const Y = y / maxValue;
  const K = k / maxValue;

  const r = (1 - Math.min(1, C * (1 - K) + K));
  const g = (1 - Math.min(1, M * (1 - K) + K));
  const b = (1 - Math.min(1, Y * (1 - K) + K));

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export interface ToRGBAOptions {
  colorSpace: ColorSpace;
  bitDepth: 8 | 16;
  samplesPerPixel: number;
}

export function toRGBA(
  source: Uint8Array | Uint16Array,
  { colorSpace, bitDepth, samplesPerPixel }: ToRGBAOptions,
): Uint8ClampedArray {
  const pixels8 = source instanceof Uint16Array ? map16BufferTo8(source) : source;
  const pixelCount = Math.floor(pixels8.length / samplesPerPixel);
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  if (colorSpace === 'GRAY') {
    for (let i = 0; i < pixelCount; i++) {
      const value = pixels8[i];
      const offset = i * 4;
      rgba[offset] = value;
      rgba[offset + 1] = value;
      rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    }
    return rgba;
  }

  if (colorSpace === 'CMYK') {
    for (let i = 0; i < pixelCount; i++) {
      const base = i * samplesPerPixel;
      const [r, g, b] = cmykToRgb(
        pixels8[base],
        pixels8[base + 1] ?? 0,
        pixels8[base + 2] ?? 0,
        pixels8[base + 3] ?? 0,
        bitDepth,
      );
      const offset = i * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    }
    return rgba;
  }

  // RGB
  for (let i = 0; i < pixelCount; i++) {
    const base = i * samplesPerPixel;
    const offset = i * 4;
    rgba[offset] = pixels8[base];
    rgba[offset + 1] = pixels8[base + 1] ?? pixels8[base];
    rgba[offset + 2] = pixels8[base + 2] ?? pixels8[base];
    rgba[offset + 3] = 255;
  }
  return rgba;
}
