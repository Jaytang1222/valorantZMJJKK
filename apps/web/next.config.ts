import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@valo-yiba/contracts"],
};

export default withSentryConfig(nextConfig, { silent: true });
