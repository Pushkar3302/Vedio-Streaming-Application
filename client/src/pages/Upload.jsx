import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadCloud, FileVideo, CheckCircle2 } from "lucide-react";
import { io } from "socket.io-client";
import { api, categories, message } from "../services/api";
import { Field } from "../components/Common";
export function MetadataFields({ video = {}, errors = {} }) {
  return (
    <>
      <Field
        label="Video title"
        name="title"
        defaultValue={video.title}
        required
        maxLength={150}
        placeholder="Give your video a clear, memorable title"
        error={errors.title}
      />
      <label className="field">
        Description
        <textarea
          name="description"
          defaultValue={video.description}
          rows={4}
          maxLength={5000}
          placeholder="What’s your video about?"
        />
        {errors.description && (
          <small className="error">{errors.description}</small>
        )}
      </label>
      <div className="form-row">
        <label className="field">
          Category
          <select name="category" defaultValue={video.category || "Other"}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Field
          label="Tags (separated by commas)"
          name="tags"
          defaultValue={video.tags?.join(", ")}
          placeholder="tutorial, design, ideas"
          error={errors.tags}
        />
      </div>
    </>
  );
}
export function ProcessingProgress({ video }) {
  return (
    <div className="panel processing" role="status">
      <div className="section-heading">
        <h2>
          {video.processingStatus === "ready" ? (
            <>
              <CheckCircle2 size={22} /> Ready to watch
            </>
          ) : video.processingStatus === "failed" ? (
            "Video couldn’t be prepared"
          ) : (
            "Preparing your video"
          )}
        </h2>
        <span>{video.processingProgress}%</span>
      </div>
      <progress value={video.processingProgress} max="100" />
      <p>{video.processingMessage}</p>
      {video.processingStatus === "ready" && (
        <Link className="primary" to={`/watch/${video._id}`}>
          Watch video
        </Link>
      )}
      {video.processingStatus === "failed" && (
        <Link to="/dashboard/videos">Manage your videos</Link>
      )}
    </div>
  );
}
export default function UploadPage() {
  const [file, setFile] = useState(null),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({}),
    [busy, setBusy] = useState(false),
    [percent, setPercent] = useState(0),
    [video, setVideo] = useState(null);
  const input = useRef();
  useEffect(() => {
    if (!video?._id || ["ready", "failed"].includes(video.processingStatus))
      return;
    const id = video._id;
    const socket = io({
      auth: { token: localStorage.getItem("streamx-token") },
    });
    socket.on("video:progress", (data) => {
      if (data?._id === id) setVideo(data);
    });
    const timer = setInterval(
      () =>
        api
          .get(`/videos/${id}`)
          .then((r) => setVideo(r.data))
          .catch(() => {}),
      3000,
    );
    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, [video?._id, video?.processingStatus]);
  function choose(f) {
    setError("");
    if (!f) return;
    if (!/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name)) {
      setError("Choose an MP4, MOV, MKV, WebM, AVI or M4V video.");
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      setError("Choose a video smaller than 500 MB.");
      return;
    }
    setFile(f);
  }
  async function submit(e) {
    e.preventDefault();
    if (!file) {
      setError("Choose a video first.");
      return;
    }
    setBusy(true);
    setError("");
    setErrors({});
    const data = new FormData(e.currentTarget);
    data.append("video", file);
    try {
      const r = await api.post("/videos", data, {
        onUploadProgress: (p) =>
          setPercent(Math.round((p.loaded / (p.total || file.size)) * 100)),
      });
      setVideo(r.data);
    } catch (e) {
      setError(message(e));
      setErrors(
        Object.fromEntries(
          (e.response?.data?.fields || []).map((f) => [f.field, f.message]),
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CREATOR STUDIO</div>
          <h1>Share something great.</h1>
          <p>Your story, your perspective. We’ll take care of the rest.</p>
        </div>
      </div>
      {video ? (
        <>
          <p className="success">
            Upload completed. Your video is now being processed.
          </p>
          <ProcessingProgress video={video} />
          <button
            className="mt"
            onClick={() => {
              setVideo(null);
              setFile(null);
              setPercent(0);
            }}
          >
            Upload another video
          </button>
        </>
      ) : (
        <form className="panel" onSubmit={submit}>
          <input
            ref={input}
            className="sr-only"
            aria-label="Choose video file"
            type="file"
            accept="video/*,.mkv"
            onChange={(e) => choose(e.target.files[0])}
          />
          <button
            type="button"
            className="dropzone"
            disabled={busy}
            onClick={() => input.current.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) choose(e.dataTransfer.files[0]);
            }}
          >
            {file ? <FileVideo size={34} /> : <UploadCloud size={36} />}
            <strong>
              {file ? file.name : "Drag and drop your video here"}
            </strong>
            <span>
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Click to choose another file`
                : "or click to choose a file"}
            </span>
            <small>MP4, MOV, MKV, WebM, AVI, M4V · Up to 500 MB</small>
          </button>
          <MetadataFields errors={errors} />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {busy && (
            <div role="status">
              <p>Uploading video · {percent}%</p>
              <progress max="100" value={percent} />
            </div>
          )}
          <div className="form-footer">
            <span>Your video will be publicly available once it’s ready.</span>
            <button className="primary" disabled={busy}>
              <UploadCloud size={18} />
              {busy ? "Uploading…" : "Upload video"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
