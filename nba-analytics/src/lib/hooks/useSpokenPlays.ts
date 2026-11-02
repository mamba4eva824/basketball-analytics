"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { newCalls, trimQueue, type CallLevel, type Hype, type PlayCall } from "@/lib/analytics/playCalls";

/** big plays come a little quicker — more urgent, same pitch (Phonon itself only speaks at 1×) */
const HYPE_RATE: Record<Hype, number> = { 0: 1, 1: 1.06, 2: 1.12 };

export interface SpokenPlays {
  /** the call being said right now */
  speaking: string | null;
  /** calls waiting their turn */
  waiting: number;
  error: string | null;
  /** held mid-call: the clip stops where it is, new calls keep queueing (trimmed) */
  paused: boolean;
  togglePause: () => void;
  /** cut the current call short and move on to the next one */
  skip: () => void;
  /** the most recent call started, for Replay */
  last: string | null;
  /** say the most recent call again now (cuts off the current one, un-pauses) */
  replay: () => void;
}

export interface SpokenPlaysOptions {
  enabled: boolean;
  level: CallLevel;
  focusTricode: string;
  /** 0–1 */
  volume: number;
  /** playback speed; pitch is preserved */
  rate: number;
}

/**
 * Reads new play-by-play calls aloud through /api/tts (local Ollama), one at a time. Switching on
 * says the latest call (so you hear that it works), then follows along from there — never the
 * whole game so far. Pausing holds the current clip and the queue; resuming finishes the clip, then
 * catches up on what queued meanwhile (trimQueue keeps it short). Volume and speed apply to the
 * clip that's playing too. Audio is binary, so this calls fetch directly rather than apiFetchSingle.
 */
export function useSpokenPlays(
  calls: PlayCall[] | undefined,
  { enabled, level, focusTricode, volume, rate }: SpokenPlaysOptions,
): SpokenPlays {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [last, setLast] = useState<PlayCall | null>(null);
  /** orderNumber of the newest call already taken from the feed; null = just switched on */
  const heard = useRef<number | null>(null);
  const queue = useRef<PlayCall[]>([]);
  const busy = useRef(false);
  const on = useRef(false);
  const stopAudio = useRef<(() => void) | null>(null);
  const hold = useRef(false);
  /** set by skip/replay while a call's audio is still being fetched: don't play it */
  const cut = useRef(false);
  const lastCall = useRef<PlayCall | null>(null);
  const settings = useRef({ volume, rate });
  /** controls for the clip that's playing (or fetched while paused and not started yet) */
  const clip = useRef<{ pause: () => void; resume: () => void; apply: () => void } | null>(null);

  const play = useCallback((url: string, hype: Hype) => new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    // a clip that never reports "ended" (e.g. a tab the browser won't play sound in) must not
    // stall the queue: give up a little after what's left of it, or after 20 s if that's unknown.
    // The timer only runs while the clip is playing.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      const left = Number.isFinite(audio.duration)
        ? ((audio.duration - audio.currentTime) * 1000) / audio.playbackRate + 2_000
        : 20_000;
      timer = setTimeout(() => finish(), left);
    };
    const apply = () => {
      audio.volume = settings.current.volume;
      audio.playbackRate = settings.current.rate * HYPE_RATE[hype];
      if (!audio.paused) arm();
    };
    const finish = () => { clearTimeout(timer); audio.pause(); clip.current = null; resolve(); };
    const start = () => {
      arm();
      audio.play().catch((e: unknown) => {
        clearTimeout(timer);
        clip.current = null;
        reject(new Error(e instanceof DOMException && e.name === "NotAllowedError"
          ? "The browser blocked audio. Turn the voice off and on again to allow it."
          : "The browser couldn't play the voice audio."));
      });
    };
    stopAudio.current = finish;
    clip.current = { pause: () => { clearTimeout(timer); audio.pause(); }, resume: start, apply };
    apply();
    audio.onloadedmetadata = () => { if (!audio.paused) arm(); };
    audio.onended = () => finish();
    audio.onerror = () => { clearTimeout(timer); clip.current = null; reject(new Error("The browser couldn't play the voice audio.")); };
    if (!hold.current) start();
  }), []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (on.current && !hold.current && queue.current.length) {
        const call = queue.current.shift()!;
        cut.current = false;
        lastCall.current = call;
        setLast(call);
        setWaiting(queue.current.length);
        setSpeaking(call.text);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: call.text }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? `The voice failed (HTTP ${res.status}).`);
        }
        const url = URL.createObjectURL(await res.blob());
        try {
          if (on.current && !cut.current) await play(url, call.hype ?? 0);
        } finally {
          URL.revokeObjectURL(url);
          stopAudio.current = null;
        }
        setError(null);
      }
    } catch (e) {
      // drop what's waiting; the next new play tries again (e.g. once Ollama is open)
      queue.current = [];
      setError(e instanceof Error ? e.message : "The voice failed.");
    } finally {
      busy.current = false;
      setSpeaking(null);
      // non-empty only when paused between calls
      setWaiting(queue.current.length);
    }
  }, [play]);

  useEffect(() => {
    on.current = enabled;
    if (!enabled) {
      hold.current = false;
      setPaused(false);
      heard.current = null;
      queue.current = [];
      stopAudio.current?.();
      return;
    }
    if (!calls) return;
    const fresh = heard.current === null
      ? newCalls(calls, -1, level, focusTricode).slice(-1)
      : newCalls(calls, heard.current, level, focusTricode);
    heard.current = Math.max(heard.current ?? 0, calls.at(-1)?.order ?? 0);
    queue.current = trimQueue([...queue.current, ...fresh]);
    void pump();
  }, [calls, enabled, level, focusTricode, pump]);

  useEffect(() => {
    settings.current = { volume, rate };
    clip.current?.apply();
  }, [volume, rate]);

  useEffect(() => () => {
    on.current = false;
    stopAudio.current?.();
  }, []);

  const togglePause = useCallback(() => {
    hold.current = !hold.current;
    setPaused(hold.current);
    if (hold.current) clip.current?.pause();
    else if (clip.current) clip.current.resume();
    else void pump();
  }, [pump]);

  const skip = useCallback(() => {
    cut.current = true;
    stopAudio.current?.();
  }, []);

  const replay = useCallback(() => {
    if (!lastCall.current) return;
    queue.current = [lastCall.current, ...queue.current];
    cut.current = true;
    stopAudio.current?.();
    hold.current = false;
    setPaused(false);
    void pump();
  }, [pump]);

  return {
    speaking,
    waiting,
    error: enabled ? error : null,
    paused: enabled && paused,
    togglePause,
    skip,
    last: enabled ? last?.text ?? null : null,
    replay,
  };
}
