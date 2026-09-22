import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ThumbsUp, Bookmark, Trash2 } from "lucide-react";
import { api, message, number } from "../services/api";
import { useApp } from "../context/useApp";
import {
  useData,
  Loading,
  ErrorState,
  Avatar,
  VideoCard,
} from "../components/Common";
import VideoPlayer from "../components/VideoPlayer";
import { ProcessingProgress } from "./Upload";
function Comments({ id }) {
  const { user, notify } = useApp();
  const { data, setData, error, loading } = useData(`/videos/${id}/comments`);
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="comments">
      <h2>
        Comments <span className="count">{data?.length || 0}</span>
      </h2>
      {user ? (
        <form
          className="comment-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api.post(`/videos/${id}/comments`, { text });
              setData([r.data, ...data]);
              setText("");
            } catch (e) {
              notify(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Join the conversation
            <textarea
              placeholder="Add your thoughts…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              maxLength={2000}
            />
          </label>
          <button className="primary" disabled={busy || loading}>
            Add comment
          </button>
        </form>
      ) : (
        <p>
          <Link to="/login">Log in</Link> to join the conversation.
        </p>
      )}
      {loading ? (
        <p>Loading comments…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : !data.length ? (
        <p className="muted">No comments yet. Start the conversation.</p>
      ) : (
        data.map((c) => (
          <article className="comment" key={c._id}>
            <Avatar user={c.user} />
            <div>
              <strong>{c.user?.name || "Deleted user"}</strong>
              <small>{new Date(c.createdAt).toLocaleDateString()}</small>
              <p>{c.text}</p>
            </div>
            {(user?.id === c.user?._id || user?.role === "admin") && (
              <button
                aria-label="Delete comment"
                className="icon-button"
                onClick={async () => {
                  try {
                    await api.delete(`/comments/${c._id}`);
                    setData(data.filter((x) => x._id !== c._id));
                  } catch (e) {
                    notify(message(e));
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
function Related({ id }) {
  const { data, error, loading } = useData(`/videos/${id}/related`);
  return (
    <aside className="related">
      <h2>Keep exploring</h2>
      {loading ? (
        <p>Loading related videos…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : data.length ? (
        data.map((v) => <VideoCard key={v._id} video={v} />)
      ) : (
        <p className="muted">More discoveries are on the way.</p>
      )}
    </aside>
  );
}
export default function WatchPage() {
  const { id } = useParams();
  const {
    data: video,
    setData: setVideo,
    error,
    loading,
  } = useData(`/videos/${id}`);
  const { user, notify } = useApp();
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (video.processingStatus !== "ready")
    return <ProcessingProgress video={video} />;
  const liked = video.likes.includes(user?.id);
  async function action(fn) {
    if (!user) {
      notify("Please log in to continue.");
      return;
    }
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="watch-layout">
      <div>
        <VideoPlayer
          key={id}
          video={video}
          onView={() =>
            api
              .post(`/videos/${id}/view`)
              .then((r) => setVideo((v) => ({ ...v, views: r.data.views })))
              .catch((e) => notify(message(e)))
          }
        />
        <h1 className="watch-title">{video.title}</h1>
        <p className="muted">
          {number(video.views)} views ·{" "}
          {new Date(video.createdAt).toLocaleDateString()}
        </p>
        <div className="watch-actions">
          <Link className="creator" to={`/channel/${video.owner._id}`}>
            <Avatar user={video.owner} />
            <strong>{video.owner.channelName || video.owner.name}</strong>
          </Link>
          <div>
            <button
              disabled={busy}
              className={liked ? "selected" : ""}
              onClick={() =>
                action(async () => {
                  const r = await api.post(`/videos/${id}/like`, {
                    liked: !liked,
                  });
                  setVideo((v) => ({ ...v, likes: r.data.likes }));
                })
              }
            >
              <ThumbsUp size={17} />
              {video.likes.length} Likes
            </button>
            <button
              disabled={busy}
              className={video.saved ? "selected" : ""}
              onClick={() =>
                action(async () => {
                  const r = await api[video.saved ? "delete" : "post"](
                    `/watch-later/${id}`,
                  );
                  setVideo((v) => ({ ...v, saved: r.data.saved }));
                })
              }
            >
              <Bookmark size={17} />
              {video.saved ? "Saved" : "Watch later"}
            </button>
          </div>
        </div>
        <div className="description">
          <span className="category-label">{video.category}</span>
          <p>{video.description || "No description added."}</p>
          {video.tags.map((t) => (
            <Link key={t} to={`/search?q=${encodeURIComponent(t)}`}>
              #{t}{" "}
            </Link>
          ))}
        </div>
        <Comments key={id} id={id} />
      </div>
      <Related key={`related-${id}`} id={id} />
    </div>
  );
}
