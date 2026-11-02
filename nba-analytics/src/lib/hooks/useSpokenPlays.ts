"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { newCalls, trimQueue, type CallLevel, type PlayCall } from "@/lib/analytics/playCalls";

export interface SpokenPlays {
  /** the call being said right now */
  speaking: string | null;
  /** calls waiting their turn */
  waiting: number;
  error: string | null;
}

/**
 * Reads new play-by-play calls aloud through /api/tts (local Ollama), one at a time. Switching on
 * says the latest call (so you hear that it works), then follows along from there — never the
 * whole game so far. Audio is binary, so this calls fetch directly rather than apiFetchSingle.
 */
export function useSpokenPlays(
  calls: PlayCall[] | undefined,
  { enabled, level, focusTricode }: { enabled: boolean; level: CallLevel; focusTricode: string },
): SpokenPlays {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** orderNumber of the newest call already taken from the feed; null = just switched on */
  const heard = useRef<number | null>(null);
  const queue = useRef<PlayCall[]>([]);
  const busy = useRef(false);
  const on = useRef(false);
  const stopAudio = useRef<(() => void) | null>(null);

  const play = useCallback((url: string) => new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    // a clip that never reports "ended" (e.g. a tab the browser won't play sound in) must not
    // stall the queue: give up a little after its length, or after 20 s if that's unknown
    let timer = setTimeout(() => finish(), 20_000);
    const finish = () => { clearTimeout(timer); audio.pause(); resolve(); };
    stopAudio.current = finish;
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration)) return;
      clearTimeout(timer);
      timer = setTimeout(() => finish(), audio.duration * 1000 + 2_000);
    };
    audio.onended = () => finish();
    audio.onerror = () => { clearTimeout(timer); reject(new Error("The browser couldn't play the voice audio.")); };
    audio.play().catch((e: unknown) => {
      clearTimeout(timer);
      reject(new Error(e instanceof DOMException && e.name === "NotAllowedError"
        ? "The browser blocked audio. Turn the voice off and on again to allow it."
        : "The browser couldn't play the voice audio."));
    });
  }), []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (on.current && queue.current.length) {
        const call = queue.current.shift()!;
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
          if (on.current) await play(url);
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
      setWaiting(0);
    }
  }, [play]);

  useEffect(() => {
    on.current = enabled;
    if (!enabled) {
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

  useEffect(() => () => {
    on.current = false;
    stopAudio.current?.();
  }, []);

  return { speaking, waiting, error: enabled ? error : null };
}
