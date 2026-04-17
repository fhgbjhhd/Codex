import { describe, expect, it } from "vitest";
import { __storageTestUtils } from "./storage.ts";

describe("storage gateway URL defaults", () => {
  it("uses the gateway port when the UI runs on a local dev port", () => {
    expect(
      __storageTestUtils.resolveDefaultGatewayUrl({
        protocol: "http:",
        host: "localhost:3000",
        hostname: "localhost",
        port: "3000",
      } as Location),
    ).toBe("ws://127.0.0.1:18789");
  });

  it("keeps the current host for normal control-ui serving", () => {
    expect(
      __storageTestUtils.resolveDefaultGatewayUrl({
        protocol: "http:",
        host: "127.0.0.1:18789",
        hostname: "127.0.0.1",
        port: "18789",
      } as Location),
    ).toBe("ws://127.0.0.1:18789");
  });

  it("migrates a stored localhost:3000 gateway URL back to the local gateway port", () => {
    expect(
      __storageTestUtils.normalizeStoredGatewayUrl("ws://localhost:3000", {
        protocol: "http:",
        hostname: "localhost",
        port: "3000",
      } as Location),
    ).toBe("ws://127.0.0.1:18789");
  });

  it("preserves custom remote gateway URLs", () => {
    expect(
      __storageTestUtils.normalizeStoredGatewayUrl("wss://gw.example.com:443", {
        protocol: "http:",
        hostname: "localhost",
        port: "3000",
      } as Location),
    ).toBe("wss://gw.example.com:443");
  });
});
