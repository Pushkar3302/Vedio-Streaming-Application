import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Play,
  Search,
  Plus,
  Home,
  Clock,
  Bookmark,
  LayoutDashboard,
  Video,
  BarChart3,
  Settings,
  Menu,
  LogOut,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../context/useApp";
import { Avatar } from "./Common";
export default function Layout() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false);
  const nav = (to, Icon, label) => (
    <NavLink onClick={() => setOpen(false)} to={to} end>
      <Icon size={20} />
      {label}
    </NavLink>
  );
  return (
    <>
      <header>
        <div className="brand-area">
          <button
            className="icon-button mobile-toggle"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Play size={18} fill="currentColor" />
            </span>
            Stream<span>X</span>
            <sup>BETA</sup>
          </Link>
        </div>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/search?q=${encodeURIComponent(query)}`);
          }}
        >
          <label className="sr-only" htmlFor="search">
            Search videos
          </label>
          <Search size={19} />
          <input
            id="search"
            placeholder="Search videos, creators, and more"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <div className="header-actions">
          <Link to="/upload" className="primary">
            <Plus size={18} />
            <span>Upload video</span>
          </Link>
          {user ? (
            <Link to="/profile" aria-label="Your profile">
              <Avatar user={user} />
            </Link>
          ) : (
            <Link className="login-link" to="/login">
              Log in <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      </header>
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="nav-group">
          {nav("/", Home, "Home")}
          {nav("/history", Clock, "History")}
          {nav("/watch-later", Bookmark, "Watch later")}
        </div>
        <div className="nav-group">
          <p className="nav-label">YOUR STUDIO</p>
          {nav("/dashboard", LayoutDashboard, "Overview")}
          {nav("/dashboard/videos", Video, "My videos")}
          {nav("/dashboard/analytics", BarChart3, "Analytics")}
        </div>
        <div className="sidebar-bottom">
          {!user && (
            <div className="creator-invite">
              <div className="invite-symbol">
                <Play size={18} />
              </div>
              <h3>Made to be shared.</h3>
              <p>Your ideas deserve an audience.</p>
              <Link to="/register">
                Start creating <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
          {nav("/profile", Settings, "Settings")}
          {user?.role === "admin" &&
            nav("/admin", ShieldCheck, "Administration")}
          {user && (
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              <LogOut size={18} /> Log out
            </button>
          )}
          <div className="sidebar-footer">
            STREAMX <span>Watch. Create. Connect.</span>
          </div>
        </div>
      </aside>
      <main>
        <Outlet />
      </main>
    </>
  );
}
