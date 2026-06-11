import "server-only";

export type SseSender<TFrame> = (frame: TFrame) => void;

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

export function createSseResponse<TFrame>(
  producer: (send: SseSender<TFrame>) => Promise<void> | void,
  errorFrame: (message: string) => TFrame,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: TFrame) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(frame)}\n\n`),
        );
      };

      try {
        await producer(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send(errorFrame(message));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
