import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { randomBytes } from "node:crypto";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.MEDIA_STORAGE = "gridfs";
process.env.MAX_UPLOAD_MB = "25";
process.env.MAX_VIDEO_SECONDS = "120";
const { config } = await import("../config.js");
const { createApp } = await import("../app.js");
const { createQueue, ffmpeg, run, videoDir } =
  await import("../services/processing.js");
const { Video } = await import("../models/index.js");
const { storeOriginal } = await import("../services/media-storage.js");
let mongo, app, token, temp, videoId, queue;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  temp = await fs.mkdtemp(path.join(tmpdir(), "streamx-gridfs-"));
  const r = await request(createApp({ add() {} }))
    .post("/api/auth/register")
    .send({
      name: "GridFS Tester",
      email: "gridfs@example.com",
      password: "gridfs-test-123",
    });
  token = r.body.token;
  queue = createQueue({ to: () => ({ emit() {} }) });
  app = createApp(queue);
});
after(async () => {
  if (videoId) await fs.rm(videoDir(videoId), { recursive: true, force: true });
  if (temp) await fs.rm(temp, { recursive: true, force: true });
  await mongoose.disconnect();
  await mongo?.stop();
});
async function awaitStatus(id) {
  for (let i = 0; i < 150; i++) {
    const video = await Video.findById(id);
    if (["ready", "failed"].includes(video.processingStatus)) return video;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Processing timed out");
}
test(
  "GridFS preserves originals, recovers after disk loss, serves HLS and cleans all media on deletion",
  { timeout: 90000 },
  async () => {
    const sample = path.join(temp, "sample.mp4");
    await run(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=854x480:rate=24",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      sample,
    ]);
    // Pause queue dispatch to simulate a restart after upload acknowledgement.
    const uploadApp = createApp({ add() {} });
    const r = await request(uploadApp)
      .post("/api/videos")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Durable video")
      .attach("video", sample);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    videoId = r.body._id;
    assert.equal(
      await mongoose.connection.db
        .collection("media.files")
        .countDocuments({ "metadata.kind": "original" }),
      1,
    );
    await fs.rm(videoDir(videoId), { recursive: true, force: true });
    await queue.recover();
    let video = await awaitStatus(videoId);
    assert.equal(video.processingStatus, "ready");
    assert.deepEqual([...video.qualities], [360, 480]);
    // Serving must work even with the entire scratch directory gone.
    await fs.rm(videoDir(videoId), { recursive: true, force: true });
    const master = await request(app).get(video.masterPlaylist);
    assert.equal(master.status, 200);
    assert.match(master.text, /480p\/index.m3u8/);
    const variant = await request(app).get(`/media/${videoId}/480p/index.m3u8`);
    assert.equal(variant.status, 200);
    const segment = variant.text.split("\n").find((v) => v.endsWith(".ts"));
    const media = await request(app).get(`/media/${videoId}/480p/${segment}`);
    assert.equal(media.status, 200);
    assert.match(media.headers["content-type"], /video\/mp2t/);
    assert.equal((await request(app).head(video.thumbnail)).status, 200);
    assert.equal(
      (await request(app).get(`/media/${videoId}/original.mp4`)).status,
      404,
    );
    // Regeneration replaces partial/old media, rather than duplicating it.
    const count = await mongoose.connection.db
      .collection("media.files")
      .countDocuments();
    await Video.findByIdAndUpdate(videoId, { processingStatus: "processing" });
    await queue.recover();
    video = await awaitStatus(videoId);
    assert.equal(video.processingStatus, "ready");
    assert.equal(
      await mongoose.connection.db.collection("media.files").countDocuments(),
      count,
    );
    assert.equal((await request(app).get("/api/config")).body.maxUploadMB, 25);
    const deleted = await request(app)
      .delete(`/api/videos/${videoId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(deleted.status, 200);
    assert.equal(
      await mongoose.connection.db.collection("media.files").countDocuments(),
      0,
    );
    assert.equal(
      await mongoose.connection.db.collection("media.chunks").countDocuments(),
      0,
    );
  },
);
test("GridFS storage quota rejects excess uploads without persisting media", async () => {
  const old = config.mediaQuota;
  config.mediaQuota = 1;
  const file = path.join(temp, "quota.mp4");
  await fs.writeFile(file, "too large");
  try {
    await assert.rejects(
      storeOriginal(new mongoose.Types.ObjectId(), file),
      (e) => e.status === 507,
    );
    assert.equal(
      await mongoose.connection.db.collection("media.files").countDocuments(),
      0,
    );
  } finally {
    config.mediaQuota = old;
  }
});
