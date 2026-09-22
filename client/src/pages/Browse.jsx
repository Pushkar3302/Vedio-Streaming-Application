import { useState } from "react";
import { useSearchParams, Link, useParams } from "react-router-dom";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import {
  useData,
  Loading,
  ErrorState,
  VideoGrid,
  Avatar,
} from "../components/Common";
import { categories, api, number, message } from "../services/api";
import { useApp } from "../context/useApp";
export function HomePage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "All",
    q = params.get("q") || "",
    sort = params.get("sort") || "recent",
    page = Number(params.get("page") || 1);
  const { data, loading, error } = useData(
    `/videos?${new URLSearchParams({ q, category, sort, page })}`,
  );
  const change = (key, value) => {
    const p = new URLSearchParams(params);
    p.set(key, value);
    if (key !== "page") p.delete("page");
    setParams(p);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> YOUR NEXT GREAT FIND
          </div>
          <h1>
            {q
              ? `Results for “${q}”`
              : "A little curiosity. Endless possibilities."}
          </h1>
          <p>
            {q
              ? "Discover videos that match what you’re looking for."
              : "Discover something new. Learn something unexpected. Make it your own."}
          </p>
        </div>
        <Link className="text-link" to="/upload">
          Share your story <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="browse-toolbar">
        <div className="chips">
          {["All", ...categories].map((c) => (
            <button
              key={c}
              className={category === c ? "chip active" : "chip"}
              onClick={() => change("category", c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="section-heading">
        <h2>
          {q
            ? "Search results"
            : category === "All"
              ? "Explore videos"
              : category}
          <span className="count">{data?.total || 0}</span>
        </h2>
        <label className="sort">
          <SlidersHorizontal size={15} />
          <span className="sr-only">Sort videos</span>
          <select value={sort} onChange={(e) => change("sort", e.target.value)}>
            <option value="recent">Latest uploads</option>
            <option value="popular">Most viewed</option>
          </select>
        </label>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <VideoGrid
          videos={data.videos}
          title={
            q
              ? "No matching videos found."
              : "Your next favorite video starts here."
          }
          text={
            q
              ? "Try a different search or explore another category."
              : "Be the first to share. Upload a video and bring this space to life."
          }
          action={!q}
        />
      )}
      {data?.pages > 1 && (
        <div className="pagination">
          <button
            disabled={page === 1}
            onClick={() => change("page", page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {data.pages}
          </span>
          <button
            disabled={page >= data.pages}
            onClick={() => change("page", page + 1)}
          >
            Next
          </button>
        </div>
      )}
      <div className="browse-footer">
        <span>A space for your curiosity.</span>
        <span>Powered by people. Built for discovery.</span>
      </div>
    </>
  );
}
export function LibraryPage({ type }) {
  const [refresh, setRefresh] = useState(0);
  const { notify } = useApp();
  const { data, loading, error } = useData(`/${type}`, refresh);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{type === "history" ? "Watch history" : "Watch later"}</h1>
          <p>
            {type === "history"
              ? "Pick up where you left off."
              : "Good finds, saved for the right moment."}
          </p>
        </div>
        {type === "history" && data?.length > 0 && (
          <button
            onClick={async () => {
              try {
                await api.delete("/history");
                setRefresh((v) => v + 1);
              } catch (e) {
                notify(message(e));
              }
            }}
          >
            Clear history
          </button>
        )}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <VideoGrid
          videos={data.map((r) => r.video)}
          title={
            type === "history"
              ? "Your history is empty."
              : "No videos saved yet."
          }
          text="Explore videos to find something you’ll enjoy."
          action={false}
        />
      )}
    </>
  );
}
export function ChannelPage() {
  const { id } = useParams();
  const { data, loading, error } = useData(`/channels/${id}`);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <div className="channel-banner" />
      <div className="channel-heading">
        <Avatar user={data.user} />
        <div>
          <h1>{data.user.channelName || data.user.name}</h1>
          <p>
            {data.videos.length} videos · {number(data.views)} views
          </p>
        </div>
      </div>
      <h2 className="section-title">Uploads</h2>
      <VideoGrid videos={data.videos} action={false} />
    </>
  );
}
