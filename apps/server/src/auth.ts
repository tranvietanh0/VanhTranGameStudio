import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison of a presented token against the configured one. */
export function tokenMatches(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True for IPv4 127.0.0.0/8, IPv6 ::1 and the IPv4-mapped loopback form. */
export function isLoopback(address: string | null | undefined): boolean {
  if (!address) return false;
  if (address === "::1" || address === "::ffff:127.0.0.1") return true;
  return address.startsWith("127.") || address.startsWith("::ffff:127.");
}
