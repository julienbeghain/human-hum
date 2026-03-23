import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// Load .env from monorepo root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/db"],
}

export default nextConfig
