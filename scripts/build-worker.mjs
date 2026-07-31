// AI Web Worker 사전 번들 — Turbopack이 워커 TS를 번들하지 않으므로
// esbuild로 public/ai-worker.js를 생성해 정적 자산으로 서빙한다.
import { build } from "esbuild";

await build({
  entryPoints: ["lib/engine/ai-worker.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "public/ai-worker.js",
});

console.log("built public/ai-worker.js");
