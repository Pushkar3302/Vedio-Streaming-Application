import {
  usesGridFS,
  storeOriginal,
  removeStored,
  serveStored,
} from "./services/media-storage.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const clientDist = fileURLToPath(new URL("../client/dist/", import.meta.url));
import { createHash } from "node:crypto";
import { User, Video, Comment, History, Saved, View } from "./models/index.js";
import { config, categories } from "./config.js";
import { auth, admin, optionalAuth, owns, fail } from "./middleware/auth.js";
import { videoDir, checkBinaries } from "./services/processing.js";
const profile = z.object({
  name: z.string().trim().min(2).max(80),
  channelName: z.string().trim().max(80).optional(),
  avatar: z
    .union([
      z.literal(""),
      z.url().refine((v) => v.startsWith("https://"), "Use an HTTPS image URL"),
    ])
    .optional(),
});
const metadata = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().max(5000).default(""),
  category: z.enum(categories).default("Other"),
  tags: z
    .union([z.string(), z.array(z.string())])
    .default("")
    .transform((v) =>
      (Array.isArray(v) ? v : v.split(","))
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 15),
    )
    .refine(
      (v) => v.every((t) => t.length <= 40),
      "Tags must be at most 40 characters",
    ),
});
const ownerFields = "name channelName avatar";
const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  channelName: u.channelName,
  avatar: u.avatar,
  role: u.role,
});
export function createApp(queue) {
  const app = express();
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors({ origin: config.client }));
  app.use(express.json({ limit: "100kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/api/config", (req, res) =>
    res.json({
      maxUploadMB: config.maxUpload / 1024 / 1024,
      maxVideoSeconds: config.maxDuration,
    }),
  );
  app.get("/api/health", async (req, res) => {
    let processing = true;
    try {
      await checkBinaries();
    } catch {
      processing = false;
    }
    const database = mongoose.connection.readyState === 1;
    res
      .status(database && processing ? 200 : 503)
      .json({ database, processing });
  });
  app.use("/media/:id", async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id))
        throw fail(404, "File not found.");
      const video = await Video.findById(req.params.id);
      if (
        !video ||
        video.processingStatus !== "ready" ||
        !/^\/(master\.m3u8|thumbnail\.jpg|\d+p\/(index\.m3u8|segment\d+\.ts))$/.test(
          req.path,
        )
      )
        throw fail(404, "File not found.");
      if (usesGridFS())
        return serveStored(req, res, next, req.params.id, req.path.slice(1));
      express.static(videoDir(req.params.id), {
        setHeaders(response, file) {
          response.setHeader(
            "Content-Type",
            file.endsWith(".m3u8")
              ? "application/vnd.apple.mpegurl"
              : file.endsWith(".ts")
                ? "video/mp2t"
                : "image/jpeg",
          );
          response.setHeader(
            "Cache-Control",
            file.endsWith(".m3u8") ? "no-cache" : "public, max-age=86400",
          );
        },
      })(req, res, next);
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", optionalAuth);
  const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30 });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const input = profile
      .extend({
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(8).max(72),
      })
      .parse(req.body);
    const user = await User.create({
      ...input,
      channelName: input.channelName || input.name,
      password: await bcrypt.hash(input.password, 12),
    });
    res.status(201).json({
      user: publicUser(user),
      token: jwt.sign({ id: user.id }, config.secret, { expiresIn: "7d" }),
    });
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const input = z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().max(72),
      })
      .parse(req.body);
    const user = await User.findOne({ email: input.email }).select("+password");
    if (!user || !(await bcrypt.compare(input.password, user.password)))
      throw fail(401, "Email or password is incorrect.");
    res.json({
      user: publicUser(user),
      token: jwt.sign({ id: user.id }, config.secret, { expiresIn: "7d" }),
    });
  });
  app.get("/api/auth/me", auth, (req, res) => res.json(publicUser(req.user)));
  app.put("/api/auth/profile", auth, async (req, res) =>
    res.json(
      publicUser(
        await User.findByIdAndUpdate(req.user.id, profile.parse(req.body), {
          new: true,
          runValidators: true,
        }),
      ),
    ),
  );
  app.get("/api/categories", (req, res) => res.json(categories));
  async function list(req, res) {
    const query = { processingStatus: "ready" };
    if (req.query.category && categories.includes(req.query.category))
      query.category = req.query.category;
    if (typeof req.query.q === "string" && req.query.q.trim()) {
      const escaped = req.query.q
        .slice(0, 150)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = ["title", "description", "tags"].map((key) => ({
        [key]: { $regex: escaped, $options: "i" },
      }));
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const [videos, total] = await Promise.all([
      Video.find(query)
        .populate("owner", ownerFields)
        .sort(
          req.query.sort === "popular"
            ? { views: -1, createdAt: -1 }
            : { createdAt: -1 },
        )
        .skip((page - 1) * 24)
        .limit(24),
      Video.countDocuments(query),
    ]);
    res.json({ videos, total, page, pages: Math.ceil(total / 24) });
  }
  app.get("/api/videos", list);
  app.get("/api/videos/search", list);
  const upload = multer({
    storage: multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          req.videoId = new mongoose.Types.ObjectId();
          await fs.mkdir(videoDir(req.videoId), { recursive: true });
          cb(null, videoDir(req.videoId));
        } catch (e) {
          cb(e);
        }
      },
      filename: (req, file, cb) =>
        cb(null, "original" + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: config.maxUpload, files: 1, fields: 4 },
    fileFilter: (req, file, cb) =>
      cb(
        /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.originalname) &&
          [
            "video/mp4",
            "video/quicktime",
            "video/x-matroska",
            "video/webm",
            "video/x-msvideo",
            "video/avi",
            "application/octet-stream",
          ].includes(file.mimetype)
          ? null
          : fail(400, "Choose an MP4, MOV, MKV, WebM, AVI or M4V video."),
        true,
      ),
  });
  let receivingUpload = false;
  app.post("/api/videos", auth, async (req, res, next) => {
    if (usesGridFS()) {
      if (receivingUpload)
        return next(
          fail(429, "Another video is uploading. Please try again shortly."),
        );
      receivingUpload = true;
      const release = () => {
        receivingUpload = false;
      };
      res.once("finish", release);
      res.once("close", release);
      try {
        if (
          await Video.exists({
            processingStatus: { $in: ["uploaded", "processing"] },
          })
        )
          return next(
            fail(
              429,
              "Another video is being prepared. Please try again shortly.",
            ),
          );
      } catch (e) {
        return next(e);
      }
    }
    try {
      await checkBinaries();
    } catch {
      return next(
        fail(
          503,
          "Video processing is unavailable. Check the server FFmpeg installation.",
        ),
      );
    }
    upload.single("video")(req, res, async (error) => {
      try {
        if (error) throw error;
        if (!req.file) throw fail(400, "Choose a video to upload.");
        const data = metadata.parse(req.body);
        await storeOriginal(req.videoId, req.file.path);
        const video = await Video.create({
          ...data,
          _id: req.videoId,
          owner: req.user.id,
          originalFile: req.file.filename,
        });
        queue.add(video.id);
        res.status(201).json(video);
      } catch (e) {
        if (req.videoId) await removeStored(req.videoId).catch(console.error);
        if (req.videoId)
          await fs
            .rm(videoDir(req.videoId), { recursive: true, force: true })
            .catch(console.error);
        next(e);
      }
    });
  });
  app.param("id", (req, res, next, id) =>
    mongoose.isValidObjectId(id)
      ? next()
      : next(fail(400, "This link is invalid.")),
  );
  async function getVideo(req, ready = false) {
    const video = await Video.findById(req.params.id).populate(
      "owner",
      ownerFields,
    );
    if (!video) throw fail(404, "Video not found.");
    if (video.processingStatus !== "ready") {
      if (ready) throw fail(409, "This video is not ready yet.");
      if (!req.user) throw fail(404, "Video not found.");
      owns(req, video);
    }
    return video;
  }
  app.get("/api/videos/:id", async (req, res) => {
    const video = await getVideo(req);
    const [history, saved] = req.user
      ? await Promise.all([
          History.findOne({ user: req.user.id, video: video.id }),
          Saved.exists({ user: req.user.id, video: video.id }),
        ])
      : [null, null];
    res.json({
      ...video.toObject(),
      position: history?.position || 0,
      saved: !!saved,
    });
  });
  app.put("/api/videos/:id", auth, async (req, res) => {
    const video = await getVideo(req);
    owns(req, video);
    Object.assign(video, metadata.parse(req.body));
    await video.save();
    res.json(video);
  });
  async function removeVideo(req, res) {
    const video = await getVideo(req);
    owns(req, video);
    if (["uploaded", "processing"].includes(video.processingStatus))
      throw fail(
        409,
        "Please wait until processing finishes before deleting this video.",
      );
    await removeStored(video.id);
    await fs.rm(videoDir(video.id), { recursive: true, force: true });
    await Promise.all([
      Comment.deleteMany({ video: video.id }),
      History.deleteMany({ video: video.id }),
      Saved.deleteMany({ video: video.id }),
      View.deleteMany({ video: video.id }),
    ]);
    await video.deleteOne();
    res.json({ message: "Video deleted." });
  }
  app.delete("/api/videos/:id", auth, removeVideo);
  app.post("/api/videos/:id/view", async (req, res) => {
    const video = await getVideo(req, true);
    const viewer = createHash("sha256")
      .update(req.user?.id || `${req.ip}:${req.headers["user-agent"] || ""}`)
      .digest("hex");
    try {
      await View.create({
        video: video.id,
        viewer,
        bucket: Math.floor(Date.now() / 1800000),
        expiresAt: new Date(Date.now() + 3600000),
      });
      await Video.updateOne({ _id: video.id }, { $inc: { views: 1 } });
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
    if (req.user)
      await History.updateOne(
        { user: req.user.id, video: video.id },
        { $set: { updatedAt: new Date() }, $setOnInsert: { position: 0 } },
        { upsert: true },
      );
    res.json({ views: (await Video.findById(video.id)).views });
  });
  app.post("/api/videos/:id/like", auth, async (req, res) => {
    const video = await getVideo(req, true);
    const liked = z.object({ liked: z.boolean() }).parse(req.body).liked;
    const result = await Video.findByIdAndUpdate(
      video.id,
      liked
        ? { $addToSet: { likes: req.user._id } }
        : { $pull: { likes: req.user._id } },
      { new: true },
    );
    res.json({ likes: result.likes });
  });
  app.get("/api/videos/:id/related", async (req, res) => {
    const video = await getVideo(req, true);
    res.json(
      await Video.find({
        _id: { $ne: video.id },
        processingStatus: "ready",
        $or: [{ category: video.category }, { tags: { $in: video.tags } }],
      })
        .populate("owner", ownerFields)
        .sort({ views: -1 })
        .limit(8),
    );
  });
  app.get("/api/videos/:id/comments", async (req, res) => {
    await getVideo(req, true);
    res.json(
      await Comment.find({ video: req.params.id })
        .populate("user", ownerFields)
        .sort({ createdAt: -1 })
        .limit(100),
    );
  });
  app.post("/api/videos/:id/comments", auth, async (req, res) => {
    await getVideo(req, true);
    const { text } = z
      .object({ text: z.string().trim().min(1).max(2000) })
      .parse(req.body);
    const comment = await Comment.create({
      video: req.params.id,
      user: req.user.id,
      text,
    });
    res.status(201).json(await comment.populate("user", ownerFields));
  });
  async function removeComment(req, res) {
    const comment = await Comment.findById(req.params.id);
    if (!comment) throw fail(404, "Comment not found.");
    if (String(comment.user) !== req.user.id && req.user.role !== "admin")
      throw fail(403, "You can only delete your own comments.");
    await comment.deleteOne();
    res.json({ message: "Comment deleted." });
  }
  app.delete("/api/comments/:id", auth, removeComment);
  app.put("/api/videos/:id/progress", auth, async (req, res) => {
    const video = await getVideo(req, true);
    const { position } = z
      .object({ position: z.number().finite().min(0) })
      .parse(req.body);
    await History.updateOne(
      { user: req.user.id, video: video.id },
      {
        $set: {
          position: Math.min(position, video.duration),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    res.json({ message: "Progress saved." });
  });
  app.get("/api/history", auth, async (req, res) =>
    res.json(
      (
        await History.find({ user: req.user.id })
          .sort({ updatedAt: -1 })
          .limit(100)
          .populate({
            path: "video",
            populate: { path: "owner", select: ownerFields },
          })
      ).filter((h) => h.video?.processingStatus === "ready"),
    ),
  );
  app.delete("/api/history", auth, async (req, res) => {
    await History.deleteMany({ user: req.user.id });
    res.json({ message: "History cleared." });
  });
  app.get("/api/watch-later", auth, async (req, res) =>
    res.json(
      (
        await Saved.find({ user: req.user.id })
          .sort({ createdAt: -1 })
          .limit(100)
          .populate({
            path: "video",
            populate: { path: "owner", select: ownerFields },
          })
      ).filter((s) => s.video?.processingStatus === "ready"),
    ),
  );
  app.post("/api/watch-later/:id", auth, async (req, res) => {
    await getVideo(req, true);
    await Saved.updateOne(
      { user: req.user.id, video: req.params.id },
      { $setOnInsert: { user: req.user.id, video: req.params.id } },
      { upsert: true },
    );
    res.json({ saved: true });
  });
  app.delete("/api/watch-later/:id", auth, async (req, res) => {
    await Saved.deleteOne({ user: req.user.id, video: req.params.id });
    res.json({ saved: false });
  });
  app.get("/api/channels/:id", async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw fail(404, "Channel not found.");
    const videos = await Video.find({
      owner: user.id,
      processingStatus: "ready",
    })
      .populate("owner", ownerFields)
      .sort({ createdAt: -1 });
    res.json({
      user: {
        _id: user.id,
        name: user.name,
        channelName: user.channelName,
        avatar: user.avatar,
      },
      videos,
      views: videos.reduce((n, v) => n + v.views, 0),
    });
  });
  app.get("/api/creator/videos", auth, async (req, res) =>
    res.json(
      await Video.find({ owner: req.user.id })
        .populate("owner", ownerFields)
        .sort({ createdAt: -1 }),
    ),
  );
  app.get("/api/creator/analytics", auth, async (req, res) => {
    const videos = await Video.find({ owner: req.user.id });
    res.json({
      videos: videos.length,
      views: videos.reduce((n, v) => n + v.views, 0),
      likes: videos.reduce((n, v) => n + v.likes.length, 0),
      comments: await Comment.countDocuments({
        video: { $in: videos.map((v) => v._id) },
      }),
      top: videos.sort((a, b) => b.views - a.views).slice(0, 5),
    });
  });
  app.use("/api/admin", auth, admin);
  app.get("/api/admin/users", async (req, res) =>
    res.json(await User.find().sort({ createdAt: -1 }).limit(100)),
  );
  app.get("/api/admin/videos", async (req, res) =>
    res.json(
      await Video.find()
        .populate("owner", ownerFields)
        .sort({ createdAt: -1 })
        .limit(100),
    ),
  );
  app.get("/api/admin/comments", async (req, res) =>
    res.json(
      await Comment.find()
        .populate("user", ownerFields)
        .sort({ createdAt: -1 })
        .limit(100),
    ),
  );
  app.delete("/api/admin/videos/:id", removeVideo);
  app.delete("/api/admin/comments/:id", removeComment);
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "This endpoint was not found." }),
  );
  app.use(express.static(clientDist));
  app.get("/{*path}", (req, res, next) =>
    res.sendFile(
      path.join(clientDist, "index.html"),
      (err) =>
        err &&
        next(fail(404, "Page not found. Start the frontend with npm run dev.")),
    ),
  );
  app.use((error, req, res, next) => {
    console.error(error.message);
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError)
      return res.status(400).json({
        message: error.issues[0]?.message,
        fields: error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    if (error.code === 11000)
      return res
        .status(409)
        .json({ message: "This email or record already exists." });
    if (error.code === "LIMIT_FILE_SIZE")
      return res.status(413).json({
        message: `This video is larger than the ${config.maxUpload / 1024 / 1024} MB upload limit.`,
      });
    res.status(error.status || (error.name === "CastError" ? 400 : 500)).json({
      message: error.status
        ? error.message
        : error instanceof multer.MulterError
          ? "The upload could not be accepted. Check your file and try again."
          : "Something went wrong. Please try again.",
    });
  });
  return app;
}
