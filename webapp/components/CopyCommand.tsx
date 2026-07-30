"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";

/**
 * Copies a Claude Code command to the clipboard.
 *
 * This is the whole bridge between the webapp and the commands it is forbidden
 * to run: v1 never invokes /apply or /scrape, it just hands you the exact line
 * to paste into Claude Code.
 */
export default function CopyCommand({ command, label }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  }

  return (
    <button type="button" className="cmd" onClick={copy} title={`Copy: ${command}`}>
      {copied ? "copied!" : (label ?? command)}
    </button>
  );
}
