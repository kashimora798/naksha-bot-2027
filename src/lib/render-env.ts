// Isomorphic rendering primitives.
//
// The map renderer in pdf-export.ts draws through this seam so the EXACT SAME code
// runs in two places:
//   • the browser  — DOM canvas → the watermarked, low-res on-screen preview
//   • the server   — @napi-rs/canvas → the clean, paid, print-ready PDF
// There is no second renderer to drift out of sync. Each environment supplies a
// `createCanvas` + `loadImage`; everything else (drawing, jsPDF) is pure and shared.

export interface CanvasLike {
  width: number;
  height: number;
  // Nullable to stay assignable from the DOM's HTMLCanvasElement; callers use `!`.
  getContext(type: '2d'): CanvasRenderingContext2D | null;
  toDataURL(type?: string, quality?: number): string;
}

// Anything ctx.drawImage() accepts — HTMLImageElement in the browser, napi Image on node.
export type ImageLike = CanvasImageSource;

export interface RenderEnv {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(src: string): Promise<ImageLike>;
}
