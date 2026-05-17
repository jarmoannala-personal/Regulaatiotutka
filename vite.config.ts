import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

let gitSha = "dev";
try {
  gitSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  /* no git / no commits yet */
}

// `base` is set for project-page static hosting (e.g. GitHub Pages at
// /Regulaatiotutka/). Override with VITE_BASE for other hosts (Netlify: "/").
export default defineConfig({
  base: process.env.VITE_BASE ?? "/Regulaatiotutka/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(gitSha),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    target: "es2022",
    outDir: "dist",
    // Content-hashed asset filenames already bust browser caches per build.
    sourcemap: true,
  },
});
