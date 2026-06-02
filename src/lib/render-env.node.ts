// Node/server implementation — used ONLY by the Vercel render function
// (api/render-pdf.ts). MUST NOT be imported by any browser/client code, or Vite
// would try to bundle the native @napi-rs/canvas binary into the client.
import { createCanvas as napiCreateCanvas, loadImage as napiLoadImage, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'node:path';
import type { RenderEnv, CanvasLike, ImageLike } from './render-env';

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  // On Vercel's Linux runtime there are no system fonts, so we register our own.
  // Latin is aliased to "sans-serif" (the family the renderer hard-codes); Devanagari
  // is registered too and picked up by glyph fallback for Hindi text. (Emoji are
  // stripped by the renderer — napi has no working emoji fallback, see render-text.)
  const dir = join(process.cwd(), 'public', 'fonts');
  GlobalFonts.registerFromPath(join(dir, 'NotoSans-Regular.ttf'), 'sans-serif');
  GlobalFonts.registerFromPath(join(dir, 'NotoSans-Bold.ttf'), 'sans-serif');
  GlobalFonts.registerFromPath(join(dir, 'NotoSansDevanagari-Regular.ttf'), 'sans-serif');
  GlobalFonts.registerFromPath(join(dir, 'NotoSansDevanagari-Bold.ttf'), 'sans-serif');
  fontsReady = true;
}

export const nodeEnv: RenderEnv = {
  createCanvas(width, height): CanvasLike {
    ensureFonts();
    return napiCreateCanvas(width, height) as unknown as CanvasLike;
  },
  async loadImage(src): Promise<ImageLike> {
    // napi loadImage accepts http(s) URLs, data URIs, paths and buffers.
    return (await napiLoadImage(src)) as unknown as ImageLike;
  },
};
