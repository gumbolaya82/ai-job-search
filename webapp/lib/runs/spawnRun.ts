import fs from "node:fs";
import { spawn } from "node:child_process";

/**
 * The only place this app starts a process.
 *
 * Detached with `stdio` pointed at the run's log file, because the run outlives
 * the request that started it — a dev-server restart mid-run must not kill it.
 */
export function spawnDetached({
  command,
  argv,
  cwd,
  logFile,
}: {
  command: string;
  argv: string[];
  cwd: string;
  logFile: string;
}): number {
  const out = fs.openSync(logFile, "a");
  try {
    const child = spawn(command, argv, {
      cwd,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
    if (!child.pid) throw new Error("spawn returned no pid");
    return child.pid;
  } finally {
    fs.closeSync(out);
  }
}
