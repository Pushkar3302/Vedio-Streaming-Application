import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Plus,
  Video,
  Eye,
  ThumbsUp,
  MessageSquare,
  Trash2,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { useData, Loading, ErrorState, Empty } from "../components/Common";
import { useApp } from "../context/useApp";
import { api, message, number } from "../services/api";
import { MetadataFields } from "./Upload";
export default function DashboardPage() {
  const path = useLocation().pathname;
  const [refresh, setRefresh] = useState(0),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState(false);
  const { notify } = useApp();
  const stats = useData("/creator/analytics", refresh),
    videos = useData("/creator/videos", refresh);
  const onlyVideos = path.endsWith("/videos"),
    onlyAnalytics = path.endsWith("/analytics");
  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/videos/${deleting._id}`);
      setDeleting(null);
      setRefresh((v) => v + 1);
      notify("Video deleted.");
    } catch (e) {
      notify(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CREATOR STUDIO</div>
          <h1>
            {onlyVideos
              ? "Your videos"
              : onlyAnalytics
                ? "Your impact, in numbers."
                : "A home for your creativity."}
          </h1>
          <p>
            {onlyVideos
              ? "Manage the stories you’ve shared."
              : "See how your videos are doing, all in one place."}
          </p>
        </div>
        <Link className="primary" to="/upload">
          <Plus size={18} /> Upload video
        </Link>
      </div>
      {stats.error && <ErrorState error={stats.error} />}
      {!onlyVideos && stats.data && (
        <div className="stats">
          {[
            ["Videos", stats.data.videos, Video],
            ["Views", stats.data.views, Eye],
            ["Likes", stats.data.likes, ThumbsUp],
            ["Comments", stats.data.comments, MessageSquare],
          ].map(([label, value, Icon]) => (
            <div className="panel stat" key={label}>
              <Icon size={20} />
              <p>{label}</p>
              <strong>{number(value)}</strong>
            </div>
          ))}
        </div>
      )}
      {onlyAnalytics ? (
        stats.loading ? (
          <Loading />
        ) : (
          stats.data && (
            <div className="panel">
              <h2>Most viewed videos</h2>
              {stats.data.top.length ? (
                stats.data.top.map((v) => (
                  <div className="analytics-row" key={v._id}>
                    <Link to={`/watch/${v._id}`}>{v.title}</Link>
                    <div className="bar">
                      <span
                        style={{
                          width: `${stats.data.views ? (v.views / stats.data.views) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{number(v.views)} views</strong>
                  </div>
                ))
              ) : (
                <Empty />
              )}
            </div>
          )
        )
      ) : (
        <>
          <div className="section-heading">
            <h2>{onlyVideos ? "All uploads" : "Recent uploads"}</h2>
            <button onClick={() => setRefresh((v) => v + 1)}>
              Refresh status
            </button>
          </div>
          {videos.loading ? (
            <Loading />
          ) : videos.error ? (
            <ErrorState error={videos.error} />
          ) : videos.data.length ? (
            <div className="video-table">
              {videos.data.map((v) => (
                <div className="video-row" key={v._id}>
                  <div className="mini-thumbnail">
                    {v.thumbnail ? <img src={v.thumbnail} alt="" /> : <Video />}
                  </div>
                  <div className="video-row-info">
                    <strong>{v.title}</strong>
                    <p>
                      {number(v.views)} views ·{" "}
                      {new Date(v.createdAt).toLocaleDateString()}
                    </p>
                    <span className={`status ${v.processingStatus}`}>
                      {v.processingStatus === "processing"
                        ? `${v.processingMessage} ${v.processingProgress}%`
                        : v.processingStatus}
                    </span>
                  </div>
                  <div className="row-actions">
                    {v.processingStatus === "ready" && (
                      <Link
                        aria-label={`Watch ${v.title}`}
                        to={`/watch/${v._id}`}
                      >
                        <ExternalLink size={17} />
                      </Link>
                    )}
                    <button
                      aria-label={`Edit ${v.title}`}
                      onClick={() => setEditing(v)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      disabled={["uploaded", "processing"].includes(
                        v.processingStatus,
                      )}
                      aria-label={`Delete ${v.title}`}
                      onClick={() => setDeleting(v)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="You haven’t uploaded any videos yet." />
          )}
        </>
      )}
      {editing && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Edit video"
            className="panel modal"
          >
            <h2>Edit video</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api.put(
                    `/videos/${editing._id}`,
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                  setEditing(null);
                  setRefresh((v) => v + 1);
                  notify("Video updated.");
                } catch (e) {
                  notify(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <MetadataFields video={editing} />
              <div className="row-actions">
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  Save changes
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Delete video"
            className="panel modal"
          >
            <h2>Delete “{deleting.title}”?</h2>
            <p>
              The video, comments, and streaming files will be permanently
              removed.
            </p>
            <div className="row-actions">
              <button onClick={() => setDeleting(null)}>Cancel</button>
              <button className="danger" disabled={busy} onClick={remove}>
                Delete video
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
export function AdminPage() {
  const [tab, setTab] = useState("videos"),
    [refresh, setRefresh] = useState(0),
    [deleting, setDeleting] = useState(null);
  const { notify } = useApp();
  const { data, loading, error } = useData(`/admin/${tab}`, refresh);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Administration</h1>
          <p>Manage the StreamX community.</p>
        </div>
      </div>
      <div className="chips">
        {["videos", "users", "comments"].map((t) => (
          <button
            key={t}
            className={tab === t ? "chip active" : "chip"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <div className="panel mt">
          {data.length ? (
            data.map((item) => (
              <div className="admin-row" key={item._id}>
                <div>
                  <strong>{item.title || item.name || item.text}</strong>
                  <p>{item.email || item.owner?.name || item.user?.name}</p>
                </div>
                {tab !== "users" && (
                  <button onClick={() => setDeleting(item._id)}>Delete</button>
                )}
              </div>
            ))
          ) : (
            <Empty title={`No ${tab} yet`} action={false} />
          )}
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm deletion"
            className="panel modal"
          >
            <h2>
              Permanently delete this {tab === "videos" ? "video" : "comment"}?
            </h2>
            <div className="row-actions">
              <button onClick={() => setDeleting(null)}>Cancel</button>
              <button
                className="danger"
                onClick={async () => {
                  try {
                    await api.delete(`/admin/${tab}/${deleting}`);
                    setDeleting(null);
                    setRefresh((v) => v + 1);
                  } catch (e) {
                    notify(message(e));
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
