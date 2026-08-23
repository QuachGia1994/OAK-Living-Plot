export interface DecodedImage {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

export function decodedImageFromPayload(payload: unknown): DecodedImage | null {
  const base64 = extractBase64Image(payload);
  if (!base64) return null;
  const image = decodeImage(base64);
  return image && image.bytes.byteLength >= 256 ? image : null;
}

function extractBase64Image(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const image = (payload as Record<string, unknown>).image;
  return typeof image === 'string' && image.length > 100 ? image : null;
}

function decodeImage(value: string): DecodedImage | null {
  try {
    const encoded = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { bytes, contentType: 'image/jpeg', extension: 'jpg' };
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { bytes, contentType: 'image/png', extension: 'png' };
    }
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      return { bytes, contentType: 'image/webp', extension: 'webp' };
    }
    return null;
  } catch {
    return null;
  }
}
