import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { createServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { User } from "./models/index.js";
import { createApp } from "./app.js";
import { createQueue, checkBinaries } from "./services/processing.js";
export async function start() {
  if (!config.secret || config.secret.length < 32)
    throw Error(
      "Set JWT_SECRET to at least 32 random characters in server/.env.",
    );
  await mongoose.connect(config.mongo, { serverSelectionTimeoutMS: 10000 });
  console.log("MongoDB connected");
  let queue;
  const server = createServer(
    createApp({
      add(id) {
        queue.add(id);
      },
    }),
  );
  const io = new Server(server, { cors: { origin: config.client } });
  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth.token, config.secret);
      const user = await User.findById(payload.id);
      if (!user) throw Error();
      socket.user = user.id;
      next();
    } catch {
      next(new Error("Please log in to receive processing updates."));
    }
  });
  io.on("connection", (socket) => socket.join(socket.user));
  queue = createQueue(io);
  await checkBinaries().catch((e) =>
    console.error("FFmpeg unavailable. Uploads disabled:", e.message),
  );
  await queue.recover();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  console.log(
    `StreamX API listening on ${config.host}:${server.address().port}`,
  );
  return { server, io };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  start().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
