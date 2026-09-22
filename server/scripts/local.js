import { MongoMemoryServer } from "mongodb-memory-server";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
const dbPath = path.resolve("../.local-mongo");
await fs.mkdir(dbPath, { recursive: true });
const mongo = await MongoMemoryServer.create({
  instance: { dbPath, storageEngine: "wiredTiger" },
});
process.env.MONGO_URI = mongo.getUri("streamx");
process.env.JWT_SECRET ||= randomBytes(48).toString("hex");
const { start } = await import("../index.js");
const { server, io } = await start();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    io.close();
    server.close();
    await mongo.stop();
    process.exit(0);
  });
