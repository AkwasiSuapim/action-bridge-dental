export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const KNOWN = ['application/pdf', 'image/jpeg', 'image/png', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'];

/** Infers a supported MIME type from what the picker reported, falling back to the file extension. */
export function mimeTypeFor(uri: string, reported: string | null | undefined): string | null {
  if (reported && KNOWN.includes(reported)) return reported;
  if (reported === 'image/jpg') return 'image/jpeg';
  const ext = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'm4a') return 'audio/mp4';
  return null;
}
