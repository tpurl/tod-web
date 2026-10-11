import { indicesToRgba } from './framebuffer.ts';
import { cssSize, integerScale } from './scaling.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH, type TileScreen } from './tileScreen.ts';

/**
 * Presents a TileScreen on a canvas at the largest pixel-exact integer scale
 * that fits inside `container`. Measuring the container (not the window)
 * keeps the screen inside the visible area on phones, where the window size
 * can include space hidden behind browser bars, and leaves room for the
 * touch controls when they are shown.
 */
export class Display {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly indices = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  private readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas;
    this.container = container;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

    new ResizeObserver(() => this.fit()).observe(container);
    window.addEventListener('resize', () => this.fit());
    this.fit();
  }

  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const scale = integerScale(this.container.clientWidth, this.container.clientHeight, dpr);
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
