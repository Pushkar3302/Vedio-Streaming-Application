import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { config } from "../config.js";
export function fail(status, message) {
  return Object.assign(new Error(message), { status });
}
export async function optionalAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      const payload = jwt.verify(token, config.secret);
      req.user = await User.findById(payload.id);
      if (!req.user) throw Error();
    }
    next();
  } catch {
    next(fail(401, "Your session expired. Please log in again."));
  }
}
export function auth(req, res, next) {
  if (!req.user) return next(fail(401, "Please log in to continue."));
  next();
}
export function admin(req, res, next) {
  if (req.user?.role !== "admin")
    return next(fail(403, "Administrator access is required."));
  next();
}
export function owns(req, video) {
  if (
    String(video.owner._id || video.owner) !== String(req.user._id) &&
    req.user.role !== "admin"
  )
    throw fail(403, "You can only manage your own videos.");
}
