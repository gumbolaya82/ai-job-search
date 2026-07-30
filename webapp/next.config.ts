import type { NextConfig } from "next";

const config: NextConfig = {
  // The app reads a real person's CV, address and job history off local disk.
  // It is a localhost tool; nothing here is designed to be exposed.
  poweredByHeader: false,

  // Pin tracing to webapp/ so `next build` does not walk up past the repo root
  // looking for a lockfile. The build still prints an "unexpected file in NFT
  // list" warning: lib/repoRoot.ts genuinely walks the filesystem to find the
  // repo, which defeats static tracing. That is expected and harmless — output
  // file tracing only matters when deploying a bundle, and this app is a
  // localhost tool that is never deployed.
  outputFileTracingRoot: process.cwd(),

  experimental: {
    // npm installs TypeScript 7, whose compiler API Next 16 cannot drive
    // directly. The CLI path type-checks with whatever tsc is installed.
    useTypeScriptCli: true,
  },
};

export default config;
