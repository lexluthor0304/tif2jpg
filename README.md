# TIFF → JPEG (Client-side)

Convert TIFF images to JPEG fully within the browser while hosting static assets on Cloudflare Workers. No file ever leaves the device thanks to in-browser decoding and encoding.

## Quick start

```bash
npm i
npm run build        # builds client bundle into public/assets
npm run cf:dev       # serve via Cloudflare Worker locally
npm run cf:deploy    # deploy to Cloudflare Workers
```

## Project layout

```
wrangler.toml
src/
  edge/worker.ts      # Cloudflare Worker module serving static assets with strict headers
  client/
    main.ts           # UI, queue orchestration, drag & drop
    decode.worker.ts  # Browser Web Worker: decoding, scaling, encoding JPEG
    tiff-adapter.ts   # UTIF wrapper for TIFF probing and page decoding
    color.ts          # Bit-depth mapping, CMYK → sRGB conversions
    scale.ts          # High quality scaling + orientation handling
    pages.ts          # Page selection helpers
    zip.ts            # ZIP builder powered by fflate
public/
  index.html
  styles.css
  favicon.svg
  assets/             # Vite build output target
vite.config.ts
```

## Privacy & architecture

- **Hosting**: Static assets are served from Cloudflare Workers using the modern `[assets]` binding and hardened CSP/COOP headers.
- **Processing**: Files are never uploaded. TIFF decoding, scaling, and JPEG encoding happen inside a browser Web Worker so the UI stays responsive.
- **Networking**: No POST/PUT/PATCH/DELETE endpoints exist. The Worker only responds to GET/HEAD/OPTIONS and forwards to static assets.

## Features

- Multi-file, multi-page TIFF ingestion with drag-and-drop or file picker.
- Inspect and select specific pages (e.g., `1,3-5`), or convert all pages.
- Quality slider (60–95), optional maximum output dimension, and metadata stripping (default on via canvas re-encode).
- Color conversions for grayscale, RGB, and CMYK sources with 16-bit to 8-bit tonemapping.
- Orientation-aware scaling using OffscreenCanvas/createImageBitmap when available with a `<canvas>` fallback.
- Per-file progress, thumbnails, and download buttons plus a ZIP export powered by `fflate`.
- Accessibility-conscious UI with keyboard focus states and i18n-ready copy (English + Simplified Chinese).

## Limits & compatibility

- TIFF coverage: Baseline, PackBits, LZW, Deflate, and JPEG-in-TIFF (best effort via UTIF). 8/16-bit Gray/RGB and CMYK are supported with automatic sRGB conversion.
- Huge images: The app uses incremental decoding and scaling, but extremely large pages may still exhaust browser memory.
- Browser requirements: OffscreenCanvas, createImageBitmap, and Web Workers are leveraged when available. Older browsers fall back to `<canvas>` APIs.

## Testing

Vitest covers color conversion utilities, scale calculations, and page selection parsing. Run the suite with:

```bash
npm test
```

## Deployment notes

1. Build assets with `npm run build`. The bundle lands in `public/assets` which Cloudflare Workers serves.
2. `npm run cf:dev` starts Wrangler dev mode, executing the Worker locally.
3. `npm run cf:deploy` uploads the Worker + static bundle to Cloudflare.

