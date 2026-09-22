import mongoose from "mongoose";
import { categories } from "../config.js";
const { Schema } = mongoose;
const ref = (model) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  required: true,
});
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true, select: false },
    avatar: { type: String, default: "" },
    channelName: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true },
);
export const User = mongoose.model("User", userSchema);
export const Video = mongoose.model(
  "Video",
  new Schema(
    {
      title: { type: String, required: true },
      description: { type: String, default: "" },
      owner: ref("User"),
      originalFile: { type: String, select: false },
      thumbnail: String,
      masterPlaylist: String,
      qualities: [Number],
      duration: Number,
      category: { type: String, enum: categories, default: "Other" },
      tags: [String],
      views: { type: Number, default: 0 },
      likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
      processingStatus: {
        type: String,
        enum: ["uploaded", "processing", "ready", "failed"],
        default: "uploaded",
      },
      processingProgress: { type: Number, default: 0 },
      processingMessage: { type: String, default: "Video uploaded." },
    },
    { timestamps: true },
  ),
);
export const Comment = mongoose.model(
  "Comment",
  new Schema(
    {
      video: ref("Video"),
      user: ref("User"),
      text: { type: String, required: true, maxlength: 2000 },
    },
    { timestamps: true },
  ),
);
const historySchema = new Schema(
  {
    user: ref("User"),
    video: ref("Video"),
    position: { type: Number, default: 0 },
  },
  { timestamps: true },
);
historySchema.index({ user: 1, video: 1 }, { unique: true });
export const History = mongoose.model("History", historySchema);
const savedSchema = new Schema(
  { user: ref("User"), video: ref("Video") },
  { timestamps: true },
);
savedSchema.index({ user: 1, video: 1 }, { unique: true });
export const Saved = mongoose.model("Saved", savedSchema);
const viewSchema = new Schema({
  video: ref("Video"),
  viewer: String,
  bucket: Number,
  expiresAt: Date,
});
viewSchema.index({ video: 1, viewer: 1, bucket: 1 }, { unique: true });
viewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const View = mongoose.model("View", viewSchema);
