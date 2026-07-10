import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // 커버 이미지 업로드가 Server Action에 File로 직접 전달되는데, 기본 바디 크기 제한(1MB)이
  // validateCoverImage가 허용하는 5MB보다 작아 그 사이 크기의 정상 파일이 413으로 실패하는 문제 방지
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "pwgfymfapzvqiolgtabd.supabase.co",
      },
    ],
  },
};

export default nextConfig;
