import axios from "axios";
export const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("streamx-token");
  if (token && !["/auth/login", "/auth/register"].includes(config.url))
    config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export const message = (e) =>
  e.response?.data?.message ||
  "Unable to connect. Please check that the server is running.";
export const categories = [
  "Technology",
  "Education",
  "Gaming",
  "Music",
  "Entertainment",
  "Sports",
  "News",
  "Other",
];
export const duration = (s) =>
  `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;
export const number = (n) =>
  new Intl.NumberFormat("en", { notation: "compact" }).format(n || 0);
