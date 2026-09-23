# Free deployment: Render + MongoDB Atlas

This deployment serves the React build, API, Socket.IO and HLS media from one Render URL. It uses a **Free Render web service** and an **Atlas Free (M0) cluster**. `render.yaml` explicitly selects the free plan and does not attach a paid disk. Do not select a paid upgrade or add a payment method to bypass a provider verification requirement without reviewing it yourself.

## Why video storage is different online

Render's free filesystem is temporary. With `MEDIA_STORAGE=gridfs`, originals are saved to MongoDB before upload acknowledgement; generated thumbnails, playlists and segments are stored there before a video becomes ready. Express streams these files from GridFS. Scratch files are removed after processing. On restart, unfinished jobs restore their original file from GridFS and regenerate their variants.

Local development still defaults to disk storage. Existing local users and videos are **not automatically copied** to your cloud database.

## 1. Create the free database

Sign in to [MongoDB Atlas](https://cloud.mongodb.com). Create a dedicated StreamX project and select **Free / M0**, not Flex or Dedicated. Create a database user with read/write permission only for the `streamx` database. Save the password in your password manager. In Connect → Drivers, obtain the MongoDB connection string and set its database name to `streamx`. URL-encode special characters in the database password.

Keep this URI secret. Enter it only in Render's secret environment-variable field, never GitHub or a public chat.

Under Atlas Network Access, allow the outbound IP ranges shown in your Render service's Connect menu. Avoid an unrestricted `0.0.0.0/0` rule. The first deployment may wait for database connectivity while you configure these ranges.

## 2. Deploy the repository

Sign in to [Render](https://dashboard.render.com). Choose New → Blueprint and select:

`https://github.com/Pushkar3302/Vedio-Streaming-Application`

Use the `main` branch. Review the proposed service: it must say **Free**, with no persistent disk or paid database. Supply `MONGO_URI` using the Atlas connection string. Render generates the JWT secret. The Blueprint sets the remaining variables, including the 25 MB upload limit, 120-second duration limit, 350 MB media budget and one FFmpeg encoding thread.

The native build command is `npm ci --include=dev && npm run build`; the start command is `npm start`. The service binds to Render's `PORT` on `0.0.0.0`. The exact Render URL is picked up through `RENDER_EXTERNAL_URL`, so frontend, API and sockets share one origin. For a custom domain, explicitly set `CLIENT_URL` to its HTTPS origin.

After deployment, visit the actual `.onrender.com` URL shown by Render. `/api/health` must return HTTP 200 with `database: true` and `processing: true`. Register a new account, upload a short test video, wait for processing, and verify playback. Restart the service once and verify the same video still plays.

## Limits and expectations

- Render Free services sleep after 15 minutes of inactivity and can restart at any time. The first visit after sleeping can take a while. Processing is serialized and may be slow.
- Atlas Free storage is limited to 512 MB, including data/indexes. StreamX limits media payloads to 350 MB to leave room for metadata and indexes; this is headroom, not a guarantee for unlimited other records.
- Originals plus every generated quality consume storage. This is a short-video portfolio demonstration, not a production video CDN. Atlas and Render also have network/usage quotas; exceeding those can throttle or suspend the free service. No paid fallback is configured.
- The free configuration accepts one upload/processing job at a time. Delete old videos through My videos to free space.
- Keep the deployment to one server instance: the queue and upload admission lock are process-local. Multi-instance scaling requires a durable distributed queue.
- A process termination in the middle of an unacknowledged GridFS upload can leave incomplete chunks. For a long-lived production service, implement a periodic orphan audit and dedicated object storage.

## Optional Docker deployment

`Dockerfile` builds the same app for a container host. It has not been built on this machine because Docker Desktop is not running. Render's Blueprint uses its native Node runtime and does not require Docker.

For a container, supply `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` and `MEDIA_STORAGE=gridfs`. Set `TRUST_PROXY_HOPS` only to the actual number of trusted reverse proxies. Disk mode instead requires a durable mount at `STORAGE_DIR` owned by the container's node user.

## Environment additions

| Variable | Meaning |
| --- | --- |
| `HOST` | Local default `127.0.0.1`; cloud `0.0.0.0` |
| `TRUST_PROXY_HOPS` | Default 0; Render uses 1 for per-client rate limiting |
| `MEDIA_STORAGE` | `disk` locally or `gridfs` on the free host |
| `MEDIA_QUOTA_MB` | GridFS payload budget, default 350 MB |
| `MAX_VIDEO_SECONDS` | 0 disables limit locally; free deployment uses 120 |
| `FFMPEG_THREADS` | Encoding thread count; free deployment uses 1 |
| `STORAGE_DIR` | Scratch directory in GridFS mode; durable media directory in disk mode |

References: [Render free service behavior](https://render.com/docs/free), [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Atlas free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [MongoDB GridFS](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/).
