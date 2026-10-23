// Upload limit of the frame-project routes (import POST /api/frame/projects, save PUT /api/frame/projects/:id), shared by the browser and the server.
// Vercel refuses any request body above 4.5 MB before the application runs; 4.4 MB (decimal, 4 400 000 bytes) leaves a margin, so the local
// server and the deployed one accept and refuse the same projects. Sizes are UTF-8 bytes of the JSON text actually sent, not JavaScript characters.
export const FRAME_UPLOAD_MAX_BYTES = 4_400_000;
export const FRAME_UPLOAD_LIMIT_TEXT = '4.4 MB';

/** Size in bytes of a text sent as UTF-8 (a non-ASCII character takes 2 to 4 bytes). */
export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** MB with two decimals, rounded UP so a size just above the limit never reads as equal to it. */
export const megabytes = (bytes: number) => `${(Math.ceil(bytes / 10_000) / 100).toFixed(2)} MB`;

/** The message shown when project data is above the limit (bytes unknown: the server or the platform refused it without a size). */
export function uploadTooLargeMessage(bytes?: number, sent = false) {
  const size = bytes !== undefined && Number.isFinite(bytes) ? `The project data is ${megabytes(bytes)}; ` : 'The project data is larger than the limit; ';
  return `${size}the upload limit is ${FRAME_UPLOAD_LIMIT_TEXT}. ${sent ? 'Nothing was saved.' : 'Nothing was sent or saved.'}`;
}
