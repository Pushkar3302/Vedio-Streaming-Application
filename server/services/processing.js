import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { Video } from "../models/index.js";
import { config } from "../config.js";
export const ffmpeg = process.env.FFMPEG_PATH || ffmpegStatic;
export const ffprobe = process.env.FFPROBE_PATH || ffprobeStatic.path;
export function run(binary, args, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false });
    let output = "",
      error = "";
    child.stdout.on("data", (d) => {
      output = (output + d).slice(-1000000);
      if (onProgress) onProgress(d.toString());
    });
    child.stderr.on("data", (d) => {
      error = (error + d).slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(error || `Process exited ${code}`)),
    );
  });
}
export async function checkBinaries() {
  await run(ffmpeg, ["-version"]);
  await run(ffprobe, ["-version"]);
}
export function videoDir(id) {
  if (!/^[a-f0-9]{24}$/.test(String(id)))
    throw new Error("Invalid video identifier");
  return path.join(config.storage, String(id));
}
export function qualitiesFor(height) {
  const levels = [360, 480, 720, 1080].filter((h) => h <= height);
  return levels.length ? levels : [Math.floor(height / 2) * 2];
}
export async function encode(original, dir, update) {
  const probe = JSON.parse(
    await run(ffprobe, [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,matroska,webm,avi",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      original,
    ]),
  );
  const stream = probe.streams.find((s) => s.codec_type === "video");
  if (
    !stream ||
    !Number.isFinite(Number(probe.format.duration)) ||
    Number(probe.format.duration) <= 0
  )
    throw Error("File has no usable video stream");
  const rotation = Math.abs(
    Number(stream.side_data_list?.find((s) => s.rotation)?.rotation || 0),
  );
  const sourceHeight = rotation % 180 === 90 ? stream.width : stream.height;
  const sourceWidth = rotation % 180 === 90 ? stream.height : stream.width;
  const duration = Number(probe.format.duration);
  const qualities = qualitiesFor(sourceHeight);
  if (qualities[0] < 2) throw Error("Invalid video dimensions");
  await update(3, "Creating your thumbnail…");
  await run(ffmpeg, [
    "-y",
    "-protocol_whitelist",
    "file,pipe",
    "-format_whitelist",
    "mov,matroska,webm,avi",
    "-ss",
    String(Math.min(1, duration / 3)),
    "-i",
    original,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-2",
    path.join(dir, "thumbnail.jpg"),
  ]);
  const variants = [];
  for (let i = 0; i < qualities.length; i++) {
    const h = qualities[i],
      width = Math.max(2, Math.round((sourceWidth * h) / sourceHeight / 2) * 2),
      rate = { 360: 800, 480: 1400, 720: 2800, 1080: 5000 }[h] || 600;
    const target = path.join(dir, `${h}p`);
    await fs.mkdir(target, { recursive: true });
    await update(5 + (i / qualities.length) * 90, `Preparing ${h}p quality…`);
    let last = 0;
    await run(
      ffmpeg,
      [
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,webm,avi",
        "-i",
        original,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        `scale=${width}:${h},setsar=1`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        `${rate}k`,
        "-maxrate",
        `${Math.round(rate * 1.1)}k`,
        "-bufsize",
        `${rate * 2}k`,
        "-force_key_frames",
        "expr:gte(t,n_forced*4)",
        "-sc_threshold",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-f",
        "hls",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments",
        "-hls_segment_filename",
        path.join(target, "segment%05d.ts"),
        "-progress",
        "pipe:1",
        "-nostats",
        path.join(target, "index.m3u8"),
      ],
      (data) => {
        const match = data.match(/out_time_us=(\d+)/);
        if (match && Date.now() - last > 1000) {
          last = Date.now();
          void update(
            Math.min(
              94,
              5 +
                ((i + Number(match[1]) / 1000000 / duration) /
                  qualities.length) *
                  90,
            ),
            `Preparing ${h}p quality…`,
          ).catch(console.error);
        }
      },
    );
    variants.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${(Math.ceil(rate * 1.15) + 128) * 1000},RESOLUTION=${width}x${h}\n${h}p/index.m3u8`,
    );
  }
  await update(97, "Preparing video for streaming…");
  await fs.writeFile(
    path.join(dir, "master.m3u8"),
    "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n" +
      variants.join("\n") +
      "\n",
  );
  return { duration, qualities };
}
export function createQueue(io) {
  const queue = [];
  let busy = false;
  async function drain() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const id = queue.shift();
      try {
        const video = await Video.findById(id).select("+originalFile");
        if (!video) continue;
        const update = async (progress, message) => {
          const result = await Video.findOneAndUpdate(
            { _id: id, processingStatus: { $in: ["uploaded", "processing"] } },
            {
              processingStatus: "processing",
              processingProgress: Math.round(progress),
              processingMessage: message,
            },
            { new: true },
          );
          if (result) io.to(String(video.owner)).emit("video:progress", result);
        };
        await update(1, "Preparing your video…");
        const result = await encode(
          path.join(videoDir(id), video.originalFile),
          videoDir(id),
          update,
        );
        const ready = await Video.findByIdAndUpdate(
          id,
          {
            ...result,
            thumbnail: `/media/${id}/thumbnail.jpg`,
            masterPlaylist: `/media/${id}/master.m3u8`,
            processingStatus: "ready",
            processingProgress: 100,
            processingMessage: "Your video is ready to watch.",
          },
          { new: true },
        );
        io.to(String(video.owner)).emit("video:progress", ready);
      } catch (error) {
        console.error("Video processing failed:", id, error.message);
        const failed = await Video.findByIdAndUpdate(
          id,
          {
            processingStatus: "failed",
            processingMessage:
              "We couldn't process this video. Please try another video file.",
          },
          { new: true },
        ).catch(() => null);
        if (failed) io.to(String(failed.owner)).emit("video:progress", failed);
      }
    }
    busy = false;
  }
  return {
    add(id) {
      if (!queue.includes(String(id))) queue.push(String(id));
      void drain();
    },
    async recover() {
      const interrupted = await Video.find({
        processingStatus: { $in: ["uploaded", "processing"] },
      });
      for (const v of interrupted) this.add(v._id);
    },
  };
}
