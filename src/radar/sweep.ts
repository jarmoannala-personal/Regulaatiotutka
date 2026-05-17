import type { AppState } from "../state/appState";

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/**
 * Drives auto mode: advances the timeline cursor by `speed` years/second via
 * requestAnimationFrame while `state.playing`. Call {@link sync} on every state
 * change; it starts/stops itself and emits the new cursor position.
 */
export class SweepDriver {
  private raf = 0;
  private last = 0;

  constructor(
    private endMs: number,
    private onTick: (epochMs: number) => void,
    private onReachEnd: () => void,
  ) {}

  sync(state: AppState): void {
    if (state.playing && this.raf === 0) {
      this.last = performance.now();
      this.speed = state.speed;
      this.pos = state.timelinePosition;
      this.raf = requestAnimationFrame(this.frame);
    } else if (!state.playing && this.raf !== 0) {
      this.stop();
    } else if (state.playing) {
      // Speed may have changed; keep cursor synced to external scrubs.
      this.speed = state.speed;
      this.pos = state.timelinePosition;
    }
  }

  private speed = 1;
  private pos = 0;

  private frame = (now: number): void => {
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.pos += dt * this.speed * YEAR_MS;
    if (this.pos >= this.endMs) {
      this.pos = this.endMs;
      this.onTick(this.pos);
      this.stop();
      this.onReachEnd();
      return;
    }
    this.onTick(this.pos);
    this.raf = requestAnimationFrame(this.frame);
  };

  private stop(): void {
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
