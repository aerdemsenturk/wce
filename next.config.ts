import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Commons serves thumbnails from upload.wikimedia.org
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // ...but falls back to generic file-type icons (e.g. for audio/video
      // files with no real thumbnail) served from commons.wikimedia.org itself
      { protocol: "https", hostname: "commons.wikimedia.org" },
    ],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
