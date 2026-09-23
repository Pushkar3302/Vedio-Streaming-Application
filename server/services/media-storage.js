import mongoose from "mongoose";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { config } from "../config.js";
import { fail } from "../middleware/auth.js";
export const usesGridFS = () => config.mediaStorage === "gridfs";
const bucket = () =>
  new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "media",
  });
let pending = Promise.resolve();
async function exclusive(fn) {
  const work = pending.then(fn);
  pending = work.catch(() => {});
  return work;
}
export async function removeStored(id, generatedOnly = false) {
  if (!usesGridFS()) return;
  const query = { "metadata.video": String(id) };
  if (generatedOnly) query["metadata.kind"] = "generated";
  for await (const file of bucket().find(query))
    await bucket().delete(file._id);
}
async function put(id, relative, source, kind) {
  return exclusive(async () => {
    const name = `${id}/${relative}`;
    const existing = await bucket().find({ filename: name }).toArray();
    for (const file of existing) await bucket().delete(file._id);
    const { size } = await fs.stat(source);
    const totals = await mongoose.connection.db
      .collection("media.files")
      .aggregate([{ $group: { _id: null, total: { $sum: "$length" } } }])
      .toArray();
    if ((totals[0]?.total || 0) + size > config.mediaQuota)
      throw fail(
        507,
        "Video storage is full. Delete an older video and try again.",
      );
    const destination = bucket().openUploadStream(name, {
      metadata: { video: String(id), kind },
    });
    try {
      await pipeline(createReadStream(source), destination);
    } catch (e) {
      await destination.abort().catch(() => {});
      throw e;
    }
  });
}
export async function storeOriginal(id, file) {
  if (usesGridFS()) await put(id, path.basename(file), file, "original");
}
export async function restoreOriginal(id, name, dir) {
  if (!usesGridFS()) return;
  await fs.mkdir(dir, { recursive: true });
  await pipeline(
    bucket().openDownloadStreamByName(`${id}/${path.basename(name)}`),
    createWriteStream(path.join(dir, path.basename(name))),
  );
}
export async function storeGenerated(id, dir) {
  if (!usesGridFS()) return;
  await removeStored(id, true);
  async function walk(folder, prefix = "") {
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      const relative = prefix + item.name;
      if (item.isDirectory())
        await walk(path.join(folder, item.name), relative + "/");
      else if (/\.(m3u8|ts|jpg)$/.test(item.name))
        await put(id, relative, path.join(folder, item.name), "generated");
    }
  }
  await walk(dir);
}
export async function serveStored(req, res, next, id, relative) {
  try {
    const file = await bucket()
      .find({ filename: `${id}/${relative}`, "metadata.kind": "generated" })
      .next();
    if (!file) throw fail(404, "File not found.");
    res.type(
      relative.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : relative.endsWith(".ts")
          ? "video/mp2t"
          : "image/jpeg",
    );
    res.set("Content-Length", String(file.length));
    res.set(
      "Cache-Control",
      relative.endsWith(".m3u8") ? "no-cache" : "public, max-age=86400",
    );
    if (req.method === "HEAD") return res.end();
    await pipeline(bucket().openDownloadStream(file._id), res);
  } catch (e) {
    if (!res.destroyed) next(e);
  }
}
