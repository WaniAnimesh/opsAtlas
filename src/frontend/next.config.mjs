/**
 * Hybrid architecture: Atlas pages are statically exported (Cloudflare Pages);
 * simulator pages are client-rendered and call the API at NEXT_PUBLIC_API_URL.
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
