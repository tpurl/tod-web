import { indicesToRgba } from './framebuffer.ts';
import { cssSize, integerScale } from './scaling.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH, type TileScreen } from './tileScreen.ts';

/** Presents a TileScreen on a canvas at the largest pixel-exact integer scale. */
export class Display {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly indices = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    window.addEventListener('resize', () => this.fit());
    this.fit();
  }

  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const scale = integerScale(window.innerWidth, window.innerHeight, dpr);
    const { width, height } = cssSize(scale, dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  present(screen: TileScreen): void {
    screen.render(this.indices);
    indicesToRgba(this.indices, this.image.data);
    this.ctx.putImageData(this.image, 0, 0);
  }
}
