import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { HookEvent } from "@studio/shared";
import { isLoopback, tokenMatches } from "../src/auth.ts";
import { createHttpHandler } from "../src/http.ts";

const TOKEN = "test-token-0123456789abcdef";

describe("token and loopback checks", () => {
  test("tokenMatches accepts only the exact token", () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(TOKEN + "x", TOKEN)).toBe(false);
    expect(tokenMatches("", TOKEN)).toBe(false);
    expect(tokenMatches(null, TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
  });

  test("isLoopback recognises IPv4 and IPv6 loopback only", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("192.168.1.20")).toBe(false);
    expect(isLoopback("100.64.0.7")).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});

describe("HTTP and WS token enforcement", () => {
  const hooks: HookEvent[] = [];
  let server: Server<unknown>;
  let base: string;

  beforeAll(() => {
    const handler = createHttpHandler({
      token: TOKEN,
      webDist: "C:/this/path/does/not/exist",
      onHook: (ev) => {
        hooks.push(ev);
      },
    });
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: handler,
      websocket: { open() {}, message() {}, close() {} },
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  const hookBody: HookEvent = {
    paneId: "w1:p1",
    event: "Stop",
    payload: {},
  };

  test("hook endpoint rejects a request with no token header", async () => {
    const res = await fetch(`${base}/hooks/claude`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(hookBody),
    });
    expect(res.status).toBe(401);
    expect(hooks.length).toBe(0);
  });

  test("hook endpoint rejects a wrong token header", async () => {
    const res = await fetch(`${base}/hooks/claude`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-token": "nope" },
      body: JSON.stringify(hookBody),
    });
    expect(res.status).toBe(401);
    expect(hooks.length).toBe(0);
  });

  test("hook endpoint accepts the right token and forwards the event", async () => {
    const res = await fetch(`${base}/hooks/claude`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-token": TOKEN },
      body: JSON.stringify(hookBody),
    });
    expect(res.status).toBe(204);
    expect(hooks.length).toBe(1);
    expect(hooks[0]?.paneId).toBe("w1:p1");
  });

  test("hook endpoint rejects a malformed body with 400", async () => {
    const res = await fetch(`${base}/hooks/claude`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-token": TOKEN },
      body: JSON.stringify({ paneId: "", event: "Nope" }),
    });
    expect(res.status).toBe(400);
  });

  test("WS upgrade without a token is refused", async () => {
    const res = await fetch(`${base}/ws`);
    expect(res.status).toBe(401);
  });

  test("WS upgrade with a wrong token is refused", async () => {
    const res = await fetch(`${base}/ws?token=wrong`);
    expect(res.status).toBe(401);
  });

  test("WS upgrade with the right token is accepted", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${TOKEN}`);
    const outcome = await new Promise<string>((resolve) => {
      ws.onopen = () => resolve("open");
      ws.onerror = () => resolve("error");
      ws.onclose = () => resolve("close");
    });
    ws.close();
    expect(outcome).toBe("open");
  });
});
