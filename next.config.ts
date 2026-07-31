import type { NextConfig } from "next";

// GitHub Pages는 https://<user>.github.io/<repo>/ 하위 경로에 서빙되므로
// CI에서 NEXT_PUBLIC_BASE_PATH=/Kapago-baduk-app 를 주입한다. 로컬은 빈 값.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export", // 정적 사이트로 내보내기 (out/)
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
