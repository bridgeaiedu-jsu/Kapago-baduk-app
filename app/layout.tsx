import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "바둑 - Baduk",
  description: "온라인 바둑 게임",
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
