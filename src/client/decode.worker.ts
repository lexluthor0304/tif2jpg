import { decodePage, probeTiff, releaseTiff } from './tiff-adapter';
import { toRGBA } from './color';
import { drawToCanvas } from './scale';
import { parsePageSelection } from './pages';

export interface ConvertOptions {
  quality: number;
  maxDimension?: number;
  stripMetadata: boolean;
  pageMode: 'all' | 'custom';
  pageExpression: string;
}

export interface ConvertMessage {
  type: 'convert';
  id: string;
  file: File;
  options: ConvertOptions;
}

type WorkerMessage = ConvertMessage;

type WorkerResponse =
  | { type: 'probe'; id: string; pages: number; width: number; height: number; bitDepth: 8 | 16; colorSpace: string }
  | { type: 'status'; id: string; pageIndex: number; total: number; status: 'decoding' | 'encoding' | 'done' }
  | { type: 'page'; id: string; pageIndex: number; total: number; blob: Blob; width: number; height: number; name: string }
  | { type: 'complete'; id: string }
  | { type: 'error'; id: string; pageIndex?: number; message: string };

const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message || message.type !== 'convert') {
    return;
  }

  const { id, file, options } = message;

  try {
    const info = await probeTiff(file);
    postMessage({ type: 'probe', id, pages: info.pages, width: info.width, height: info.height, bitDepth: info.bitDepth, colorSpace: info.colorSpace } satisfies WorkerResponse);

    const selection = parsePageSelection(info.pages, options.pageMode, options.pageExpression ?? '');
    const total = selection.length;

    for (const [position, pageIndex] of selection.entries()) {
      try {
        postMessage({ type: 'status', id, pageIndex, total, status: 'decoding' } satisfies WorkerResponse);
        const decoded = await decodePage(file, pageIndex);
        const rgba = toRGBA(decoded.pixels, {
          colorSpace: decoded.colorSpace,
          bitDepth: decoded.bitDepth,
          samplesPerPixel: decoded.samplesPerPixel,
        });
        postMessage({ type: 'status', id, pageIndex, total, status: 'encoding' } satisfies WorkerResponse);
        const canvas = await drawToCanvas(rgba, {
          width: decoded.width,
          height: decoded.height,
          maxDimension: options.maxDimension,
          orientation: decoded.orientation,
        });
        const blob = await canvasToBlob(canvas, options.quality / 100);
        const name = buildPageName(file.name, pageIndex, position, total);
        postMessage({ type: 'page', id, pageIndex, total, blob, width: decoded.width, height: decoded.height, name } satisfies WorkerResponse);
        disposeCanvas(canvas);
        postMessage({ type: 'status', id, pageIndex, total, status: 'done' } satisfies WorkerResponse);
      } catch (error) {
        postMessage({ type: 'error', id, pageIndex, message: (error as Error).message } satisfies WorkerResponse);
      }
    }

    postMessage({ type: 'complete', id } satisfies WorkerResponse);
  } catch (error) {
    postMessage({ type: 'error', id, message: (error as Error).message } satisfies WorkerResponse);
  } finally {
    releaseTiff(file);
  }
});

function postMessage(message: WorkerResponse) {
  ctx.postMessage(message);
}

function disposeCanvas(canvas: any) {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function canvasToBlob(canvas: any, quality: number): Promise<Blob> {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: Math.min(0.95, Math.max(0.1, quality)) });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob: Blob | null) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Unable to encode JPEG'));
        }
      },
      'image/jpeg',
      Math.min(0.95, Math.max(0.1, quality)),
    );
  });
}

function buildPageName(original: string, pageIndex: number, position: number, total: number): string {
  const base = original.replace(/\.[^.]+$/, '');
  const suffix = total > 1 ? `-p${pageIndex + 1}` : '';
  return `${base}${suffix}.jpg`;
}

export {};
