import type { GameTime } from '../types'
import { gameTimeToMinutes, minutesToGameTime } from '../types'

// ── Constants ──────────────────────────────────────────────────────────────

/** Each simulation step advances time by this many minutes. */
export const STEP_MINUTES = 30

/**
 * At 1× speed: 1 real second = 1 simulated minute.
 * A full 30-min step fires every 30 real seconds at 1×.
 * At 4×: fires every 7.5 real seconds. At 8×: every 3.75 seconds.
 */
export const MS_PER_SIM_MINUTE_AT_1X = 100

export type TimeScale = 1 | 2 | 4 | 8

// ── Types ──────────────────────────────────────────────────────────────────

export interface TimeTickResult {
  /** True if at least one 30-minute step completed this tick. */
  stepFired: boolean
  /** How many steps completed (almost always 0 or 1). */
  stepsCompleted: number
  /** The new GameTime after all steps (only meaningful when stepFired). */
  newTime: GameTime
  /**
   * Fractional progress toward the next step (0–1).
   * Use for smooth interpolation of unit positions between steps.
   */
  stepFraction: number
}

// ── TimeSystem ─────────────────────────────────────────────────────────────

export class TimeSystem {
  private _currentTime: GameTime
  private _endTime: GameTime
  private _isPaused: boolean = true
  private _timeScale: TimeScale = 1
  /** Accumulated simulated milliseconds toward the next 30-min step. */
  private _accumMs: number = 0

  constructor(startTime: GameTime, endTime: GameTime) {
    this._currentTime = { ...startTime }
    this._endTime = { ...endTime }
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get currentTime(): GameTime { return { ...this._currentTime } }
  get isPaused(): boolean { return this._isPaused }
  get timeScale(): TimeScale { return this._timeScale }

  /**
   * Fractional progress toward next step (0 = just stepped, 1 = about to step).
   * Useful for interpolating unit positions on the map.
   */
  get stepFraction(): number {
    const stepMs = STEP_MINUTES * MS_PER_SIM_MINUTE_AT_1X
    return Math.min(this._accumMs / stepMs, 1)
  }

  get endTime(): GameTime { return { ...this._endTime } }

  get isExpired(): boolean {
    return gameTimeToMinutes(this._currentTime) >= gameTimeToMinutes(this._endTime)
  }

  // ── Controls ─────────────────────────────────────────────────────────────

  pause(): void {
    this._isPaused = true
  }

  resume(): void {
    if (!this.isExpired) {
      this._isPaused = false
    }
  }

  togglePause(): void {
    if (this._isPaused) this.resume()
    else this.pause()
  }

  setTimeScale(scale: TimeScale): void {
    this._timeScale = scale
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  /**
   * Advance the simulation by `wallClockDeltaMs` real milliseconds.
   * Call this every animation frame.
   */
  tick(wallClockDeltaMs: number): TimeTickResult {
    if (this._isPaused || this.isExpired) {
      return {
        stepFired: false,
        stepsCompleted: 0,
        newTime: this.currentTime,
        stepFraction: this.stepFraction
      }
    }

    const stepMs = STEP_MINUTES * MS_PER_SIM_MINUTE_AT_1X
    const simDeltaMs = wallClockDeltaMs * this._timeScale

    this._accumMs += simDeltaMs

    let stepsCompleted = 0
    while (this._accumMs >= stepMs) {
      this._accumMs -= stepMs
      const nextMinutes = gameTimeToMinutes(this._currentTime) + STEP_MINUTES
      this._currentTime = minutesToGameTime(nextMinutes)
      stepsCompleted++

      // Stop advancing once scenario ends
      if (this.isExpired) {
        this._isPaused = true
        this._accumMs = 0
        break
      }
    }

    return {
      stepFired: stepsCompleted > 0,
      stepsCompleted,
      newTime: this.currentTime,
      stepFraction: this.stepFraction
    }
  }

  // ── Manual step (for debugging / testing) ────────────────────────────────

  /** Force a single 30-min step immediately, regardless of accumulated time. */
  forceStep(): void {
    const nextMinutes = gameTimeToMinutes(this._currentTime) + STEP_MINUTES
    this._currentTime = minutesToGameTime(nextMinutes)
    this._accumMs = 0
  }
}
