import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { io as connect } from "socket.io-client";
import request from "supertest";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
const { config } = await import("../config.js");
const { start } = await import("../index.js");
const { run, ffmpeg, videoDir } = await import("../services/processing.js");
test(
  "real HTTP server authenticates sockets and streams processing events without duplicate responses",
  { timeout: 120000 },
  async () => {
    const mongo = await MongoMemoryServer.create();
    config.mongo = mongo.getUri();
    config.port = 0;
    const { server, io } = await start();
    const base = `http://127.0.0.1:${server.address().port}`;
    let socket, bad, id, temp;
    try {
      const registered = await request(base).post("/api/auth/register").send({
        name: "Socket Tester",
        email: "socket@example.com",
        password: "socket-test-123",
      });
      assert.equal(registered.status, 201);
      const token = registered.body.token;
      bad = connect(base, {
        autoConnect: false,
        reconnection: false,
        auth: { token: "invalid" },
      });
      const rejected = new Promise((resolve) =>
        bad.once("connect_error", resolve),
      );
      bad.connect();
      assert.match((await rejected).message, /log in/);
      bad.disconnect();
      socket = connect(base, {
        autoConnect: false,
        reconnection: false,
        auth: { token },
        transports: ["polling"],
      });
      const connected = new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      socket.connect();
      await connected;
      const events = [];
      socket.on("video:progress", (data) => events.push(data));
      temp = await fs.mkdtemp(path.join(tmpdir(), "streamx-socket-"));
      const file = path.join(temp, "silent.mp4");
      await run(ffmpeg, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=426x240:rate=24",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        file,
      ]);
      const uploaded = await request(base)
        .post("/api/videos")
        .set("Authorization", `Bearer ${token}`)
        .field("title", "Socket pipeline")
        .attach("video", file);
      assert.equal(uploaded.status, 201);
      id = uploaded.body._id;
      for (
        let i = 0;
        i < 100 && !events.some((e) => e.processingStatus === "ready");
        i++
      )
        await new Promise((r) => setTimeout(r, 100));
      assert.ok(events.some((e) => e.processingStatus === "processing"));
      assert.ok(events.some((e) => e.processingStatus === "ready"));
      assert.equal((await request(base).get("/api/health")).status, 200);
      assert.equal((await request(base).get("/")).status, 200);
      const ready = events.find((e) => e.processingStatus === "ready");
      assert.deepEqual(ready.qualities, [240]);
    } finally {
      socket?.disconnect();
      bad?.disconnect();
      await new Promise((resolve) => io.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
      if (id) await fs.rm(videoDir(id), { recursive: true, force: true });
      if (temp) await fs.rm(temp, { recursive: true, force: true });
    }
  },
);
