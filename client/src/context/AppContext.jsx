import { useEffect, useState } from "react";
import { api, message } from "../services/api";
import { Context } from "./useApp";
export function AppProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState("");
  useEffect(() => {
    if (localStorage.getItem("streamx-token"))
      api
        .get("/auth/me")
        .then((r) => setUser(r.data))
        .catch((e) => {
          if (e.response?.status === 401)
            localStorage.removeItem("streamx-token");
          else setToast(message(e));
        })
        .finally(() => setLoading(false));
    else setLoading(false);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const login = (data) => {
    localStorage.setItem("streamx-token", data.token);
    setUser(data.user);
  };
  const logout = () => {
    localStorage.removeItem("streamx-token");
    setUser(null);
  };
  return (
    <Context.Provider
      value={{ user, setUser, loading, login, logout, notify: setToast }}
    >
      {children}
      {toast && (
        <div role="status" className="toast" onClick={() => setToast("")}>
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
