import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn(() => "event_123");
const flush = vi.fn(() => Promise.resolve(true));

vi.mock("@sentry/nextjs", () => ({
  captureException,
  flush
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("Sentry smoke route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    captureException.mockClear();
    flush.mockClear();
  });

  it("reports configured Sentry without emitting events unless smoke is enabled", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@sentry.io/123");
    const { GET } = await loadRoute();

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      configured: true,
      enabled: false,
      captured: false,
      eventIdPresent: false
    });
    expect(captureException).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it("captures an event when the smoke check is explicitly enabled", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@sentry.io/123");
    vi.stubEnv("SENTRY_SMOKE_ENABLED", "1");
    const { GET } = await loadRoute();

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      configured: true,
      enabled: true,
      captured: true,
      eventIdPresent: true
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(2000);
  });
});
