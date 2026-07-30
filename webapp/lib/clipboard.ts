/**
 * Copy text, with the fallback the Clipboard API still needs.
 *
 * Shared by CopyCommand and the ⌘K palette, which both exist for the same
 * reason: this app never runs `/apply` or `/scrape`, it hands you the exact
 * line to paste into Claude Code.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // The Clipboard API needs a secure context; localhost qualifies, but fall
    // back rather than leaving the user with a dead button.
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}
