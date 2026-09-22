import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
const { createApp } = await import("../app.js");
const { User, Video, Comment, History, Saved, View } =
  await import("../models/index.js");
const { ffmpeg, run, qualitiesFor, createQueue, videoDir } =
  await import("../services/processing.js");
let mongo,
  app,
  token,
  userId,
  otherToken,
  videoId,
  temp,
  events = [];
before(
  async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all(
      [User, Video, Comment, History, Saved, View].map((m) => m.init()),
    );
    temp = await fs.mkdtemp(path.join(tmpdir(), "streamx-test-"));
    const queue = createQueue({
      to: (owner) => ({
        emit: (event, data) =>
          events.push({ owner, event, status: data.processingStatus }),
      }),
    });
    app = createApp(queue);
  },
  { timeout: 180000 },
);
after(async () => {
  if (videoId) await fs.rm(videoDir(videoId), { recursive: true, force: true });
  if (temp) await fs.rm(temp, { recursive: true, force: true });
  await mongoose.disconnect();
  await mongo?.stop();
});
test("quality ladder never upscales", () => {
  assert.deepEqual(qualitiesFor(720), [360, 480, 720]);
  assert.deepEqual(qualitiesFor(240), [240]);
  assert.deepEqual(qualitiesFor(1080), [360, 480, 720, 1080]);
});
test(
  "complete authenticated upload, HLS, library, moderation and deletion workflow",
  { timeout: 180000 },
  async () => {
    let r = await request(app).post("/api/auth/register").send({
      name: "Test Creator",
      email: "creator@example.com",
      password: "test-pass-123",
      role: "admin",
    });
    assert.equal(r.status, 201);
    token = r.body.token;
    userId = r.body.user.id;
    assert.equal(r.body.user.role, "user");
    r = await request(app).post("/api/auth/register").send({
      name: "Other User",
      email: "other@example.com",
      password: "test-pass-123",
    });
    otherToken = r.body.token;
    r = await request(app).post("/api/auth/register").send({
      name: "Duplicate",
      email: "creator@example.com",
      password: "test-pass-123",
    });
    assert.equal(r.status, 409);
    r = await request(app)
      .post("/api/auth/login")
      .send({ email: "creator@example.com", password: "wrong" });
    assert.equal(r.status, 401);
    r = await request(app)
      .post("/api/auth/login")
      .send({ email: "creator@example.com", password: "test-pass-123" });
    assert.equal(r.status, 200);
    token = r.body.token;
    const as = (method, url, t = token) =>
      request(app)[method](url).set("Authorization", `Bearer ${t}`);
    r = await as("get", "/api/auth/me");
    assert.equal(r.body.name, "Test Creator");
    assert.equal(r.body.password, undefined);
    r = await as("put", "/api/auth/profile").send({
      name: "Creator Updated",
      channelName: "Test Channel",
    });
    assert.equal(r.body.channelName, "Test Channel");
    assert.equal((await request(app).post("/api/videos")).status, 401);
    assert.equal((await as("get", "/api/admin/users")).status, 403);
    const file = path.join(temp, "sample.mp4");
    await run(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      file,
    ]);
    r = await as("post", "/api/videos")
      .field("title", "Pipeline sample")
      .field("description", "A real generated video for testing")
      .field("category", "Technology")
      .field("tags", "pipeline, sample")
      .attach("video", file);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    videoId = r.body._id;
    let video;
    for (let tries = 0; tries < 120; tries++) {
      video = await Video.findById(videoId);
      if (["ready", "failed"].includes(video.processingStatus)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(video.processingStatus, "ready");
    assert.deepEqual([...video.qualities], [360, 480, 720]);
    assert.ok(events.some((e) => e.status === "processing"));
    assert.ok(events.some((e) => e.status === "ready"));
    r = await request(app).get(video.masterPlaylist);
    assert.equal(r.status, 200);
    assert.match(r.headers["content-type"], /mpegurl/);
    assert.match(r.text, /720p\/index.m3u8/);
    assert.doesNotMatch(r.text, /1080p/);
    for (const h of video.qualities) {
      r = await request(app).get(`/media/${videoId}/${h}p/index.m3u8`);
      assert.equal(r.status, 200);
      const segment = r.text.split("\n").find((line) => line.endsWith(".ts"));
      r = await request(app).get(`/media/${videoId}/${h}p/${segment}`);
      assert.equal(r.status, 200);
      assert.match(r.headers["content-type"], /video\/mp2t/);
    }
    assert.equal((await request(app).get(video.thumbnail)).status, 200);
    assert.equal(
      (await request(app).get(`/media/${videoId}/original.mp4`)).status,
      404,
    );
    r = await request(app).get("/api/videos?q=pipeline&category=Technology");
    assert.equal(r.body.total, 1);
    assert.equal(
      (
        await as("put", `/api/videos/${videoId}`, otherToken).send({
          title: "Stolen",
        })
      ).status,
      403,
    );
    r = await as("put", `/api/videos/${videoId}`).send({
      title: "Edited pipeline",
      description: "Updated",
      category: "Technology",
      tags: "test",
    });
    assert.equal(r.body.processingStatus, "ready");
    await as("post", `/api/videos/${videoId}/view`);
    r = await as("post", `/api/videos/${videoId}/view`);
    assert.equal(r.body.views, 1);
    await as("post", `/api/videos/${videoId}/like`).send({ liked: true });
    r = await as("post", `/api/videos/${videoId}/like`).send({ liked: true });
    assert.equal(r.body.likes.length, 1);
    r = await as("post", `/api/videos/${videoId}/comments`).send({
      text: "The pipeline works.",
    });
    assert.equal(r.status, 201);
    const commentId = r.body._id;
    assert.equal(
      (await as("delete", `/api/comments/${commentId}`, otherToken)).status,
      403,
    );
    await as("post", `/api/watch-later/${videoId}`);
    await as("post", `/api/watch-later/${videoId}`);
    r = await as("get", "/api/watch-later");
    assert.equal(r.body.length, 1);
    await as("put", `/api/videos/${videoId}/progress`).send({ position: 1.2 });
    r = await as("get", `/api/videos/${videoId}`);
    assert.equal(r.body.position, 1.2);
    r = await as("get", "/api/history");
    assert.equal(r.body.length, 1);
    r = await as("get", "/api/creator/analytics");
    assert.equal(r.body.videos, 1);
    assert.equal(r.body.comments, 1);
    assert.equal(r.body.likes, 1);
    assert.equal(r.body.views, 1);
    r = await request(app).get(`/api/channels/${userId}`);
    assert.equal(r.body.videos.length, 1);
    assert.equal(
      (await request(app).get(`/api/videos/${videoId}/related`)).status,
      200,
    );
    await User.findByIdAndUpdate(userId, { role: "admin" });
    assert.equal((await as("get", "/api/admin/users")).status, 200);
    assert.equal((await as("get", "/api/admin/comments")).body.length, 1);
    assert.equal(
      (await as("delete", `/api/admin/comments/${commentId}`)).status,
      200,
    );
    await as("delete", `/api/watch-later/${videoId}`);
    assert.equal((await as("get", "/api/watch-later")).body.length, 0);
    await as("delete", "/api/history");
    assert.equal((await as("get", "/api/history")).body.length, 0);
    assert.equal(
      (await as("delete", `/api/videos/${videoId}`, otherToken)).status,
      403,
    );
    assert.equal((await as("delete", `/api/videos/${videoId}`)).status, 200);
    assert.equal(await Video.countDocuments(), 0);
    await assert.rejects(fs.access(videoDir(videoId)));
    assert.equal(
      (await request(app).get(`/api/videos/${videoId}`)).status,
      404,
    );
  },
);
test(
  "invalid video becomes failed without stopping subsequent processing",
  { timeout: 30000 },
  async () => {
    const r = await request(app)
      .post("/api/videos")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Invalid")
      .attach("video", Buffer.from("not a real video"), {
        filename: "invalid.mp4",
        contentType: "video/mp4",
      });
    assert.equal(r.status, 201);
    const id = r.body._id;
    let v;
    for (let i = 0; i < 40; i++) {
      v = await Video.findById(id);
      if (v.processingStatus === "failed") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(v.processingStatus, "failed");
    assert.equal((await request(app).get("/api/health")).status, 200);
    await fs.rm(videoDir(id), { recursive: true, force: true });
  },
);
