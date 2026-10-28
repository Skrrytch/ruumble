/** The tab title channel (ADR-0023): the title with the count of unseen notices, flashing for loud events. */
import { flashFrames, titleWithCount } from "../model.ts";

const FLASH_MS = 1000;

export class TitleChannel {
  private base = "Ruumble";
  private unseen = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** the title without the count, as the place the user is in gives it */
  setBase(base: string): void {
    this.base = base;
    if (!this.timer) this.render();
  }

  /** show the count; with a message, flash it for a few seconds */
  set(unseen: number, flashMessage?: string): void {
    this.unseen = unseen;
    this.stop();
    if (flashMessage && unseen > 0) {
      const frames = flashFrames(this.base, flashMessage, unseen);
      let i = 0;
      document.title = frames[i++]!;
      this.timer = setInterval(() => {
        if (i >= frames.length) return this.stop(), this.render();
        document.title = frames[i++]!;
      }, FLASH_MS);
    } else this.render();
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private render(): void {
    document.title = titleWithCount(this.base, this.unseen);
  }
}
