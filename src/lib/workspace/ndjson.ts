/**
 * Newline-delimited JSON over a plain response body.
 *
 * Server-sent events would also work, but this is a single request that ends
 * when the work does — there is no reconnection to manage and no event-name
 * routing to invent. One JSON object per line is the whole protocol.
 */
export function ndjsonStream(
  run: (send: (event: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        await run(send);
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Without this a proxy may hold the whole body back and defeat the point.
      "x-accel-buffering": "no",
    },
  });
}

/** Reads an ndjson body, handing each parsed object to `onEvent`. */
export async function readNdjson(
  res: Response,
  onEvent: (event: Record<string, unknown>) => void,
) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("The server sent no response body.");
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // The last piece may be a partial line; keep it for the next chunk.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {
        /* a truncated line is not worth failing the whole edit over */
      }
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer));
    } catch {
      /* ditto */
    }
  }
}
