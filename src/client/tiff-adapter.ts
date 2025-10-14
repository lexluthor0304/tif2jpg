import * as UTIF from 'utif';

export type ColorSpace = 'GRAY' | 'RGB' | 'CMYK';

export interface ProbeResult {
  pages: number;
  width: number;
  height: number;
  bitDepth: 8 | 16;
  colorSpace: ColorSpace;
}

export interface DecodedPage {
  pixels: Uint8Array | Uint16Array;
  width: number;
  height: number;
  colorSpace: ColorSpace;
  bitDepth: 8 | 16;
  orientation?: number;
  samplesPerPixel: number;
}

const cache = new WeakMap<File, Promise<{ buffer: ArrayBuffer; ifds: any[] }>>();

async function decodeIFDs(file: File) {
  if (!cache.has(file)) {
    cache.set(
      file,
      (async () => {
        const buffer = await file.arrayBuffer();
        const ifds = UTIF.decode(buffer);
        return { buffer, ifds };
      })(),
    );
  }
  return cache.get(file)!;
}

function extractBitDepth(ifd: any): 8 | 16 {
  const bits = Array.isArray(ifd.BitsPerSample) ? ifd.BitsPerSample[0] : ifd.BitsPerSample || 8;
  return bits > 8 ? 16 : 8;
}

function extractColorSpace(ifd: any): ColorSpace {
  const photo = ifd.PhotometricInterpretation;
  const samples = ifd.SamplesPerPixel || 1;
  if (photo === 5 || samples === 4) {
    return 'CMYK';
  }
  if (photo === 0 || photo === 1 || samples === 1) {
    return 'GRAY';
  }
  return 'RGB';
}

function extractOrientation(ifd: any): number | undefined {
  const orientation = Array.isArray(ifd.Orientation) ? ifd.Orientation[0] : ifd.Orientation;
  return orientation && typeof orientation === 'number' ? orientation : undefined;
}

export async function probeTiff(file: File): Promise<ProbeResult> {
  const { ifds } = await decodeIFDs(file);
  if (!ifds.length) {
    throw new Error('Invalid TIFF file');
  }
  const first = ifds[0];
  return {
    pages: ifds.length,
    width: first.width,
    height: first.height,
    bitDepth: extractBitDepth(first),
    colorSpace: extractColorSpace(first),
  };
}

export async function decodePage(file: File, pageIndex: number): Promise<DecodedPage> {
  const { buffer, ifds } = await decodeIFDs(file);
  if (pageIndex < 0 || pageIndex >= ifds.length) {
    throw new Error('Page index out of range');
  }
  const ifd = ifds[pageIndex];
  UTIF.decodeImage(buffer, ifd);
  const bitDepth = extractBitDepth(ifd);
  const colorSpace = extractColorSpace(ifd);
  const orientation = extractOrientation(ifd);

  let pixels: Uint8Array | Uint16Array;
  if (bitDepth === 16 && ifd.data instanceof Uint16Array) {
    pixels = ifd.data as Uint16Array;
  } else if (ifd.data instanceof Uint8Array) {
    pixels = ifd.data as Uint8Array;
  } else {
    const rgba = UTIF.toRGBA8(ifd);
    pixels = rgba;
  }

  return {
    pixels,
    width: ifd.width,
    height: ifd.height,
    colorSpace,
    bitDepth,
    orientation,
    samplesPerPixel: ifd.SamplesPerPixel || (colorSpace === 'GRAY' ? 1 : colorSpace === 'CMYK' ? 4 : 3),
  };
}

export function releaseTiff(file: File) {
  cache.delete(file);
}
