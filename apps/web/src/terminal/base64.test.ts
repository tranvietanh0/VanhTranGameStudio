import { describe, expect, test } from "bun:test";
import { base64ToBytes, base64ToText, bytesToBase64, textToBase64 } from "./base64";

describe("terminal base64", () => {
  test("round-trips ASCII and matches the standard encoding", () => {
    expect(textToBase64("ls -la\r")).toBe(btoa("ls -la\r"));
    expect(base64ToText(textToBase64("ls -la\r"))).toBe("ls -la\r");
  });

  test("round-trips Vietnamese text", () => {
    const text = "Xin chào, Việt Nam! Đường ươm ướt ở Hà Nội";
    expect(base64ToText(textToBase64(text))).toBe(text);
    expect(textToBase64(text)).toBe(btoa(String.fromCharCode(...new TextEncoder().encode(text))));
  });

  test("round-trips emoji (surrogate pairs)", () => {
    const text = "xong rồi 🎉👩‍💻🚀";
    expect(base64ToText(textToBase64(text))).toBe(text);
  });

  test("round-trips all 256 byte values", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  test("round-trips a buffer larger than one chunk", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7) & 0xff);
    const back = base64ToBytes(bytesToBase64(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back.every((b, i) => b === bytes[i])).toBe(true);
  });

  test("handles empty input and terminal escape bytes", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
    expect(base64ToBytes("").length).toBe(0);
    const esc = Uint8Array.from([0x1b, 0x5b, 0x32, 0x4a, 0x00, 0xff]);
    expect(Array.from(base64ToBytes(bytesToBase64(esc)))).toEqual(Array.from(esc));
  });

  test("throws on malformed base64", () => {
    expect(() => base64ToBytes("***not base64***")).toThrow();
  });
});
