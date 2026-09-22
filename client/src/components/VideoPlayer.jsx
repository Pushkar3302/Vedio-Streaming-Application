import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { api, duration } from "../services/api";
import { useApp } from "../context/useApp";
export default function VideoPlayer({ video, onView }) {
  const element = useRef(),
    hlsRef = useRef(),
    lastSave = useRef(0),
    viewed = useRef(false),
    onViewRef = useRef(onView);
  onViewRef.current = onView;
  const { user } = useApp();
  const [levels, setLevels] = useState([]),
    [quality, setQuality] = useState("-1"),
    [error, setError] = useState(""),
    [resume, setResume] = useState(
      video.position > 5 && video.position < video.duration - 5,
    ),
    [speed, setSpeed] = useState("1");
  useEffect(() => {
    const el = element.current;
    viewed.current = false;
    setQuality("-1");
    setError("");
    setResume(video.position > 5 && video.position < video.duration - 5);
    let hls;
    let recovered = false;
    if (Hls.isSupported()) {
      hls = new Hls({ capLevelToPlayerSize: false });
      hlsRef.current = hls;
      hls.loadSource(video.masterPlaylist);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () =>
        setLevels(hls.levels.map((l, index) => ({ height: l.height, index }))),
      );
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true;
          hls.recoverMediaError();
        } else
          setError("Playback was interrupted. Please reload and try again.");
      });
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = video.masterPlaylist;
      setLevels([]);
    } else
      setError(
        "This browser does not support this video format. Please try a current browser.",
      );
    const save = () => {
      if (user && el.currentTime > 0)
        api
          .put(`/videos/${video._id}/progress`, { position: el.currentTime })
          .catch(() => {});
    };
    const time = () => {
      if (Date.now() - lastSave.current > 15000) {
        lastSave.current = Date.now();
        save();
      }
    };
    const visibility = () => {
      if (document.hidden) save();
    };
    const view = () => {
      if (!viewed.current) {
        viewed.current = true;
        onViewRef.current();
      }
    };
    el.addEventListener("timeupdate", time);
    el.addEventListener("pause", save);
    el.addEventListener("playing", view);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      save();
      el.removeEventListener("timeupdate", time);
      el.removeEventListener("pause", save);
      el.removeEventListener("playing", view);
      document.removeEventListener("visibilitychange", visibility);
      hls?.destroy();
      hlsRef.current = null;
    };
  }, [video._id, video.masterPlaylist, user?.id]);
  return (
    <div className="player-wrap">
      <video
        ref={element}
        controls
        playsInline
        preload="metadata"
        poster={video.thumbnail}
        onError={() =>
          setError("We couldn’t play this video. Please try again.")
        }
        aria-label={video.title}
      />
      {error && (
        <p role="alert" className="error player-error">
          {error}
        </p>
      )}
      {resume && (
        <div className="resume">
          <button
            onClick={() => {
              element.current.currentTime = video.position;
              setResume(false);
            }}
          >
            Continue from {duration(video.position)}
          </button>
          <button
            aria-label="Dismiss continue watching"
            onClick={() => setResume(false)}
          >
            ×
          </button>
        </div>
      )}
      <div className="player-settings">
        <span>Make yourself comfortable.</span>
        <label>
          Speed{" "}
          <select
            value={speed}
            onChange={(e) => {
              setSpeed(e.target.value);
              element.current.playbackRate = Number(e.target.value);
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <label>
          Quality{" "}
          <select
            value={quality}
            onChange={(e) => {
              setQuality(e.target.value);
              if (hlsRef.current)
                hlsRef.current.nextLevel = Number(e.target.value);
            }}
          >
            <option value="-1">Auto</option>
            {levels.map((l) => (
              <option key={l.index} value={l.index}>
                {l.height}p
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
