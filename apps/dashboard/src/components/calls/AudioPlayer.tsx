"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../lib/i18n/provider";
import { Button } from "../ui/Button";

const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;

/**
 * A12.8(b): an accessible name identifying the call, keyboard-operable
 * play/pause/seek/rate controls (native <audio controls> doesn't reliably
 * expose a playback-rate control across browsers, so every control here is
 * an explicit, keyboard-focusable element wired to a hidden <audio>), and
 * state changes announced through a live region.
 */
export function AudioPlayer({
  src,
  accessibleName,
  onTimeUpdate,
}: {
  src: string;
  accessibleName: string;
  onTimeUpdate?: (currentTime: number) => void;
}) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    };
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setAnnouncement(t("calls.playbackEnded"));
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTimeUpdate]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
      setAnnouncement(t("calls.playButton"));
    } else {
      audio.pause();
      setIsPlaying(false);
      setAnnouncement(t("calls.pauseButton"));
    }
  };

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const onRateChange = (value: (typeof PLAYBACK_RATES)[number]) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = value;
    setRate(value);
    setAnnouncement(`${value}x`);
  };

  return (
    <div role="group" aria-label={accessibleName} className="flex flex-col gap-token-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a call recording has no caption track to provide */}
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-token-3">
        <Button type="button" onClick={togglePlay} aria-pressed={isPlaying}>
          {isPlaying ? t("calls.pauseButton") : t("calls.playButton")}
        </Button>
        <label className="flex flex-1 items-center gap-token-2 text-sm">
          <span className="sr-only">{t("calls.seekLabel")}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="flex-1"
          />
        </label>
        <label className="flex items-center gap-token-1 text-sm">
          <span>{rate}x</span>
          <select
            aria-label={t("calls.playbackRateLabel")}
            className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-2 text-sm"
            value={rate}
            onChange={(event) => onRateChange(Number(event.target.value) as (typeof PLAYBACK_RATES)[number])}
          >
            {PLAYBACK_RATES.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
