import mongoose from "mongoose";
import dns from "dns";

// Some networks (college wifi, certain VPNs) block Node's own DNS resolver
// even though the OS resolver works fine — this forces Node to use Google DNS
// so the mongodb+srv:// lookup succeeds.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}
