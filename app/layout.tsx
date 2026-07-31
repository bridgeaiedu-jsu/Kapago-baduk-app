import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "바둑 - Baduk",
  description:
    "브라우저에서 두는 2인 바둑 — 9×9·13×13·19×19, 따냄·패·초과패 규칙, 사석 계가 지원",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
