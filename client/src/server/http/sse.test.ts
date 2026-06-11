import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createSseResponse } from "./sse";

async function readResponseBody(response: Response): Promise<string> {
  return await response.text();
}

describe("createSseResponse", () => {
  it("streams JSON frames as event-stream data lines", async () => {
    const response = createSseResponse(
      (send) => {
        send({ type: "phase", phase: "kickoff" });
        send({ type: "done" });
      },
      (message) => ({ type: "error", message }),
    );

    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    await expect(readResponseBody(response)).resolves.toBe(
      'data: {"type":"phase","phase":"kickoff"}\n\ndata: {"type":"done"}\n\n',
    );
  });

  it("converts producer errors into the route-specific error frame", async () => {
    const response = createSseResponse(
      () => {
        throw new Error("provider unavailable");
      },
      (message) => ({ type: "error", message }),
    );

    await expect(readResponseBody(response)).resolves.toBe(
      'data: {"type":"error","message":"provider unavailable"}\n\n',
    );
  });
});
