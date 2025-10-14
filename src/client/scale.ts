type CanvasLike = OffscreenCanvas | HTMLCanvasElement;

declare const OffscreenCanvas: {
  prototype: OffscreenCanvas;
  new (width?: number, height?: number): OffscreenCanvas;
};

declare const createImageBitmap: any;

declare const document: Document | undefined;

export interface ScaleOptions {
  width: number;
  height: number;
  maxDimension?: number;
  orientation?: number;
}

export function computeScaledDimensions(width: number, height: number, maxDimension?: number): { width: number; height: number } {
  if (!maxDimension || maxDimension <= 0) {
    return { width, height };
  }
  const longer = Math.max(width, height);
  if (longer <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longer;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function createCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('Canvas is not supported in this environment');
}

function getContext(canvas: CanvasLike) {
  // @ts-expect-error both share API
  return canvas.getContext('2d');
}

function shouldSwapSize(orientation?: number): boolean {
  return orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;
}

function orientContext(ctx: CanvasRenderingContext2D, orientation: number, width: number, height: number) {
  switch (orientation) {
    case 2:
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.rotate(Math.PI / 2);
      ctx.translate(0, -height);
      break;
    case 7:
      ctx.rotate(Math.PI / 2);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;
    case 8:
      ctx.rotate(-Math.PI / 2);
      ctx.translate(-width, 0);
      break;
  }
}

export async function drawToCanvas(
  rgba: Uint8ClampedArray,
  { width, height, maxDimension, orientation }: ScaleOptions,
): Promise<CanvasLike> {
  const target = computeScaledDimensions(width, height, maxDimension);
  const srcCanvas = createCanvas(width, height);
  const srcCtx = getContext(srcCanvas);
  if (!srcCtx) {
    throw new Error('Unable to obtain drawing context');
  }
  const imageData = new ImageData(rgba, width, height);
  srcCtx.putImageData(imageData, 0, 0);

  let orientedCanvas: CanvasLike = srcCanvas;
  if (orientation && orientation !== 1) {
    const targetWidth = shouldSwapSize(orientation) ? height : width;
    const targetHeight = shouldSwapSize(orientation) ? width : height;
    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = getContext(canvas);
    if (!ctx) {
      throw new Error('Unable to obtain orientation context');
    }
    ctx.save();
    orientContext(ctx, orientation, width, height);
    ctx.drawImage(srcCanvas as any, 0, 0);
    ctx.restore();
    orientedCanvas = canvas;
  }

  if (target.width === width && target.height === height) {
    return orientedCanvas;
  }

  const destCanvas = createCanvas(target.width, target.height);
  const destCtx = getContext(destCanvas);
  if (!destCtx) {
    throw new Error('Unable to obtain target drawing context');
  }

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(orientedCanvas as any);
    destCtx.drawImage(bitmap, 0, 0, target.width, target.height);
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }
  } else {
    destCtx.drawImage(orientedCanvas as any, 0, 0, target.width, target.height);
  }

  return destCanvas;
}
