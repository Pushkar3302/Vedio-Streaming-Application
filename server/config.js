import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL(".env", import.meta.url)),
  quiet: true,
});
export const config = {
  port: Number(process.env.PORT || 5000),
  mongo: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/streamx",
  secret: process.env.JWT_SECRET,
  client: process.env.CLIENT_URL || "http://127.0.0.1:5173",
  maxUpload: Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024,
  storage: path.resolve(fileURLToPath(new URL("storage", import.meta.url))),
};
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
