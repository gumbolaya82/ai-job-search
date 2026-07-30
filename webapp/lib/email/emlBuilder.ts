/**
 * An RFC 5322 message, written to disk as a `.eml` the user opens and sends.
 *
 * Nothing in this repo can send mail — the Gmail connector is read-only and
 * there is no SMTP anywhere — so the deliverable is a draft file, not a
 * delivery. Double-clicking it opens the mail client pre-filled; the user
 * presses Send.
 *
 * UTF-8 correctness is the entire risk surface. Danish postings carry `æøå` and
 * job titles routinely contain `&`. Both body parts are therefore base64 with an
 * explicit charset, and the Subject header is RFC 2047 encoded whenever it holds
 * a non-ASCII byte. CRLF endings and 76-column base64 are spec requirements and
 * are also the classic "works in Thunderbird, breaks in Outlook" omissions.
 *
 * Pure and import-free: every non-deterministic input (date, boundary,
 * message-id) can be injected, which is what makes it testable.
 */

const CRLF = "\r\n";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n: number) => String(n).padStart(2, "0");

/** e.g. `Tue, 28 Jul 2026 19:04:11 +0000`. Always UTC — no local-offset surprises. */
export function rfc5322Date(date: Date): string {
  return (
    `${DAYS[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())} +0000`
  );
}

export function isAscii(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value);
}

/** Wrap base64 at 76 columns, as required for a transfer-encoded body part. */
export function wrapBase64(b64: string, width = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += width) lines.push(b64.slice(i, i + width));
  return lines.join(CRLF);
}

export function toBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * RFC 2047 encoded-word for a header value, applied only when it is needed.
 *
 * An ASCII subject must stay readable in the raw file; encoding it
 * unconditionally would work but makes the artefact harder to eyeball.
 */
export function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;
  return `=?UTF-8?B?${toBase64(value)}?=`;
}

/** A Message-ID with a random left-hand side, per the plan's requirement. */
export function generateMessageId(domain = "ai-job-search.local"): string {
  const rand = Math.random().toString(36).slice(2, 12);
  return `<${Date.now().toString(36)}.${rand}@${domain}>`;
}

export function generateBoundary(): string {
  return `----=_aijs_${Math.random().toString(36).slice(2, 14)}`;
}

export type EmlInput = {
  /** The candidate's own address. Empty is allowed: the client will prompt. */
  to: string;
  /** Defaults to `to` — this is a self-digest. */
  from?: string;
  subject: string;
  html: string;
  text: string;
  date?: Date;
  boundary?: string;
  messageId?: string;
};

export function buildEml({
  to,
  from,
  subject,
  html,
  text,
  date = new Date(),
  boundary = generateBoundary(),
  messageId = generateMessageId(),
}: EmlInput): string {
  const sender = from ?? to;
  const headers = [
    `Date: ${rfc5322Date(date)}`,
    `From: ${sender}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const part = (contentType: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(toBase64(body)),
      "",
    ].join(CRLF);

  return [
    headers.join(CRLF),
    "",
    // Shown by clients that render neither part; harmless where they do.
    "This is a multi-part message in MIME format.",
    "",
    part("text/plain", text),
    part("text/html", html),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}

/**
 * Pull the candidate's email out of `01-candidate-profile.md`.
 *
 * Same source `/email-report` Step 4 uses for its suggested recipient. The live
 * file writes it as `- **Email:** someone@example.com`; the pattern below also
 * accepts a plain `Email: …` line so a hand-edited profile still resolves.
 *
 * Returns null rather than guessing. The caller leaves `To:` empty and says so
 * in the UI — an unaddressed draft is recoverable, a wrong address is not.
 */
export function parseCandidateEmail(markdown: string): string | null {
  const line = /^\s*[-*]?\s*(?:\*\*)?Email(?:\*\*)?\s*:\s*(.+)$/im.exec(markdown);
  if (!line) return null;
  const match = /[^\s<>()[\],;:@"]+@[^\s<>()[\],;:@"]+\.[A-Za-z]{2,}/.exec(line[1]);
  return match ? match[0] : null;
}

/** `job-search-2026-07-28.eml` — the download filename. */
export function emlFilename(isoDate: string): string {
  return `job-search-${isoDate.slice(0, 10)}.eml`;
}

/**
 * `job-search-2026-07-28.html` — the same digest without the MIME wrapper.
 *
 * Lives beside `emlFilename` rather than in the route so both download names
 * stay derived from one rule; the stem is deliberately identical so the two
 * files sort together in a downloads folder.
 */
export function htmlFilename(isoDate: string): string {
  return `job-search-${isoDate.slice(0, 10)}.html`;
}
