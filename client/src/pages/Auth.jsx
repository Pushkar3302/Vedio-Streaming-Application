import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Play } from "lucide-react";
import { Field } from "../components/Common";
import { useApp } from "../context/useApp";
import { api, message } from "../services/api";
export function AuthPage({ register = false }) {
  const { login } = useApp();
  const navigate = useNavigate(),
    location = useLocation();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [fields, setFields] = useState({});
  return (
    <div className="auth-wrap">
      <form
        className="panel auth-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setFields({});
          try {
            const data = Object.fromEntries(new FormData(e.currentTarget));
            const r = await api.post(
              `/auth/${register ? "register" : "login"}`,
              data,
            );
            login(r.data);
            navigate(location.state?.from || "/");
          } catch (e) {
            setError(message(e));
            setFields(
              Object.fromEntries(
                (e.response?.data?.fields || []).map((f) => [
                  f.field,
                  f.message,
                ]),
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="brand-mark">
          <Play fill="currentColor" />
        </span>
        <h1>{register ? "Find your people." : "Welcome back."}</h1>
        <p>
          {register
            ? "Create an account and share your perspective."
            : "Your next great find is waiting for you."}
        </p>
        {register && (
          <Field
            label="Name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            error={fields.name}
          />
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fields.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          required
          minLength={register ? 8 : 1}
          maxLength={72}
          error={fields.password}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account" : "Log in"}
        </button>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New to StreamX?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Log in" : "Create account"}
          </Link>
        </p>
      </form>
    </div>
  );
}
export function ProfilePage() {
  const { user, setUser, notify } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className="narrow">
      <div className="page-heading">
        <div>
          <h1>Your profile</h1>
          <p>A little about you and your channel.</p>
        </div>
      </div>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api.put(
              "/auth/profile",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            setUser(r.data);
            notify("Profile updated.");
          } catch (e) {
            notify(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Name"
          name="name"
          defaultValue={user.name}
          required
          minLength={2}
          maxLength={80}
        />
        <Field
          label="Channel name"
          name="channelName"
          defaultValue={user.channelName}
          maxLength={80}
        />
        <Field
          label="Profile image URL (optional, HTTPS)"
          name="avatar"
          defaultValue={user.avatar}
          type="url"
        />
        <Field label="Email" value={user.email} disabled />
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
