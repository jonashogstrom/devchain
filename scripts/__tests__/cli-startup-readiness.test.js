const { __test__ } = require("../cli");

describe("waitForHealth", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("returns true for an immediate healthy response", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true });

    await expect(
      __test__.waitForHealth("http://127.0.0.1:41818/health"),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns true for a response within the nominal budget", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce({ ok: true });

    const readiness = __test__.waitForHealth("http://127.0.0.1:41818/health", {
      timeoutMs: 1000,
      intervalMs: 250,
    });
    await jest.runAllTimersAsync();

    await expect(readiness).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds the final post-deadline health request", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("not ready"))
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      );
    const startedAt = Date.now();

    const readiness = __test__.waitForHealth("http://127.0.0.1:41818/health", {
      timeoutMs: 100,
      intervalMs: 250,
    });
    await jest.runAllTimersAsync();

    await expect(readiness).resolves.toBe(false);
    expect(Date.now() - startedAt).toBe(1250);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a server that is healthy on the final post-deadline attempt", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce({ ok: true });

    const readiness = __test__.waitForHealth("http://127.0.0.1:41818/health", {
      timeoutMs: 100,
      intervalMs: 250,
    });
    await jest.runAllTimersAsync();

    await expect(readiness).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns false after one failed post-deadline attempt", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("not ready"));

    const readiness = __test__.waitForHealth("http://127.0.0.1:41818/health", {
      timeoutMs: 100,
      intervalMs: 250,
    });
    await jest.runAllTimersAsync();

    await expect(readiness).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
