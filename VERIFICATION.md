# Verification record

Verified locally on 22 September 2026 with Node.js 24, real MongoDB and the bundled FFmpeg/FFprobe binaries.

## Automated checks

- Production Vite build succeeds. HLS.js is loaded separately on the watch route; its vendor chunk produces Vite’s non-fatal size advisory.
- Prettier formatting check succeeds.
- Four integration tests cover no-upscale quality selection; the authenticated upload-to-HLS workflow and library/creator/admin operations; corrupt-file failure handling; and the actual HTTP/Socket.IO server with authenticated polling, real processing events, rejection of invalid credentials, and a silent 240p source.
- A real generated 720p video produces 360p, 480p and 720p variants. Master/variant manifests, thumbnails and transport-stream segments are requested over HTTP.
- Unauthorized metadata edits/deletions and admin access fail. Media deletion removes the generated files. Original video URLs return 404.

## Browser checks

- Registration and login via the interface.
- Real multipart upload of a generated 24-second 720p video.
- Restart recovery processed the interrupted upload and published it in the home grid.
- HLS.js parsed the master playlist and exposed Auto, 360p, 480p and 720p.
- Visible playback of the animated test pattern and advancing playback position.
- Manual 720p selection during playback retained the current position.
- Responsive home layout inspected at 390px and 1440px.
- A development hot-reload context failure and duplicate Socket.IO HTTP handler were reproduced and fixed; the latter now has a regression test.

## Remaining verification limits

Network-throttled automatic downshift/upshift and Safari-native HLS were not exercised in this browser session. Automatic bitrate selection uses HLS.js’s actual default adaptive controller, and the README includes steps for testing changing network conditions. Windows/Linux installation instructions are provided but this session tested macOS only. No load test or public deployment was performed.

The running local library includes one clearly named QA test-pattern upload, created through the application. It is not seeded or used as a substitute for user uploads.
