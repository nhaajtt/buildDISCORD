// Reads an uploaded file as text, with a size cap, only from Discord's own file hosts, and never following a redirect elsewhere.

const ALLOWED_HOSTS = /(^|\.)(discordapp\.com|discordapp\.net|discord\.com)$/i;

export class AttachmentError extends Error {}

export async function readAttachmentText(attachment, maxBytes, fetchImpl = globalThis.fetch) {
  if (!attachment) throw new AttachmentError("no file");
  if (!Number.isFinite(attachment.size) || attachment.size > maxBytes) throw new AttachmentError("file too large");
  if (!/\.json$/i.test(attachment.name ?? "")) throw new AttachmentError("not a .json file");

  let url;
  try {
    url = new URL(attachment.url);
  } catch {
    throw new AttachmentError("bad address");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.test(url.hostname)) throw new AttachmentError("not a Discord file");

  let response;
  try {
    response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AttachmentError("could not download the file");
  }
  if (!response.ok) throw new AttachmentError("could not download the file");
  // The size Discord reports is trusted for the cheap early refusal, but the real bytes are measured too
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new AttachmentError("file too large");
  return buffer.toString("utf8");
}
