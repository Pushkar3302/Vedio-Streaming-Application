import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Video, ArrowUpRight, RefreshCw } from "lucide-react";
import { api, message, duration, number } from "../services/api";
import { useApp } from "../context/useApp";
export function useData(url, refresh = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .get(url)
      .then((r) => active && setData(r.data))
      .catch((e) => active && setError(message(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [url, refresh]);
  return { data, setData, error, loading };
}
export function Loading() {
  return (
    <div className="video-grid" aria-label="Loading videos">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="skeleton">
          <div />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function Empty({
  title = "No videos yet",
  text = "A great video starts with you. Share something worth watching.",
  action = true,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Video size={30} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <Link className="primary" to="/upload">
          Upload your first video <ArrowUpRight size={17} />
        </Link>
      )}
    </div>
  );
}
export function ErrorState({ error }) {
  return (
    <div className="empty">
      <h2>Something needs attention</h2>
      <p role="alert">{error}</p>
      <button onClick={() => window.location.reload()}>
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  );
}
export function Avatar({ user }) {
  return user?.avatar ? (
    <img className="avatar" src={user.avatar} alt="" />
  ) : (
    <span className="avatar">
      {(user?.channelName || user?.name || "S").slice(0, 1).toUpperCase()}
    </span>
  );
}
export function VideoCard({ video }) {
  return (
    <Link to={`/watch/${video._id}`} className="video-card">
      <div className="thumbnail">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} loading="lazy" />
        ) : (
          <Video size={36} />
        )}
        <span className="duration">{duration(video.duration)}</span>
      </div>
      <div className="card-info">
        <Avatar user={video.owner} />
        <div>
          <h3>{video.title}</h3>
          <p>{video.owner?.channelName || video.owner?.name}</p>
          <p>
            {number(video.views)} views <span>·</span>{" "}
            {new Date(video.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>
    </Link>
  );
}
export function VideoGrid({ videos, ...props }) {
  return videos?.length ? (
    <div className="video-grid">
      {videos.map((video) => (
        <VideoCard key={video._id} video={video} />
      ))}
    </div>
  ) : (
    <Empty {...props} />
  );
}
export function Protected({ children, admin = false }) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && user.role !== "admin")
    return (
      <Empty
        title="Administrator access required"
        text="This page is only available to administrators."
        action={false}
      />
    );
  return children;
}
export function Field({ label, name, error, ...props }) {
  return (
    <label className="field">
      {label}
      <input name={name} {...props} />
      {error && <small className="error">{error}</small>}
    </label>
  );
}
