import { vi } from "vitest";
import * as ssrf from "../infra/net/ssrf.js";

export function mockPinnedHostnameResolution(addresses: string[] = ["93.184.216.34"]) {
  const pinnedAddresses = [...addresses];
  const originalResolvePinnedHostnameWithPolicy = ssrf.resolvePinnedHostnameWithPolicy;
  const pinnedLookupFn = (async (_hostname: string, options?: unknown) => {
    const records = pinnedAddresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
    if (
      typeof options === "object" &&
      options !== null &&
      "all" in options &&
      options.all === true
    ) {
      return records;
    }
    return records[0];
  }) as ssrf.LookupFn;

  const resolvePinnedHostnameWithPolicySpy = vi
    .spyOn(ssrf, "resolvePinnedHostnameWithPolicy")
    .mockImplementation(
      async (hostname, params = {}) =>
        await originalResolvePinnedHostnameWithPolicy(hostname, {
          ...params,
          lookupFn: params.lookupFn ?? pinnedLookupFn,
        }),
    );
  const resolvePinnedHostnameSpy = vi
    .spyOn(ssrf, "resolvePinnedHostname")
    .mockImplementation(
      async (hostname, lookupFn = pinnedLookupFn) =>
        await originalResolvePinnedHostnameWithPolicy(hostname, { lookupFn }),
    );

  return {
    mockRestore() {
      resolvePinnedHostnameWithPolicySpy.mockRestore();
      resolvePinnedHostnameSpy.mockRestore();
    },
  };
}
