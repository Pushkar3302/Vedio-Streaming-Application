import mongoose from "mongoose";
import { config } from "../config.js";
import { User } from "../models/index.js";
const email = process.argv[2];
if (!email) throw Error("Usage: npm run admin -w server -- user@example.com");
await mongoose.connect(config.mongo);
const user = await User.findOneAndUpdate(
  { email: email.toLowerCase() },
  { role: "admin" },
  { new: true },
);
console.log(
  user ? "Administrator role granted." : "Register this email first.",
);
await mongoose.disconnect();
