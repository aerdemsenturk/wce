import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) so CI can build it and
  // the production host only has to unpack and restart — no npm ci or
  // next build on the server.
  output: "standalone",
  images: {
    remotePatterns: [
      // Commons serves thumbnails from upload.wikimedia.org
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // ...and, for imageinfo thumbnails, from the dedicated thumb host
      { protocol: "https", hostname: "thumb.wikimedia.org" },
      // ...but falls back to generic file-type icons (e.g. for audio/video
      // files with no real thumbnail) served from commons.wikimedia.org itself
      { protocol: "https", hostname: "commons.wikimedia.org" },
    ],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
