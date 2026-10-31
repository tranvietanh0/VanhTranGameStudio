const CHUNK = 0x8000;

/** Bytes → base64. Chunked so large frames do not overflow the argument limit of fromCharCode. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64 → bytes. Throws (InvalidCharacterError) on malformed input; callers decide how to surface it. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Text typed in the terminal (xterm onData) → UTF-8 → base64. */
export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/** base64 → UTF-8 text (non-fatal decoding: invalid sequences become U+FFFD). */
export function base64ToText(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}
