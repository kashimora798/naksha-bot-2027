import type { RenderEnv, CanvasLike, ImageLike } from './render-env';

// Browser implementation — used for the on-screen preview and any client-side export.
// No DOM is touched at module load (only inside these functions), so this file is
// safe to import from code that also runs on the server (the node path never calls it).
export const browserEnv: RenderEnv = {
  createCanvas(width, height): CanvasLike {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c as unknown as CanvasLike;
  },
  loadImage(src): Promise<ImageLike> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img as unknown as ImageLike);
      img.onerror = () => reject(new Error('image load failed: ' + src.slice(0, 64)));
      img.src = src;
    });
  },
};
