// A small Server-Sent Events parser. It works on strings, so the caller decodes bytes with a
// streaming TextDecoder and a multi-byte character split across chunks stays intact.
// Frames end at a blank line. Lines that start with a colon are comments (heartbeats).
// A frame with no data line is dropped. A trailing frame without its blank line is dropped,
// which is how a truncated stream shows up to the caller.

export type SseFrame = {
  id: string | null;
  event: string | null;
  data: string;
};

function parseFrame(raw: string): SseFrame | null {
  let id: string | null = null;
  let event: string | null = null;
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    else if (field === "id") id = value;
    else if (field === "event") event = value;
  }
  return data.length === 0 ? null : { id, event, data: data.join("\n") };
}

export function createSseParser() {
  let buffer = "";
  // A chunk may end between the CR and LF of a CRLF pair, so a trailing CR waits for the next chunk.
  let pendingCr = false;

  const drain = (): SseFrame[] => {
    const frames: SseFrame[] = [];
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const frame = parseFrame(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (frame) frames.push(frame);
      end = buffer.indexOf("\n\n");
    }
    return frames;
  };

  return {
    push(chunk: string): SseFrame[] {
      let text = (pendingCr ? "\r" : "") + chunk;
      pendingCr = text.endsWith("\r");
      if (pendingCr) text = text.slice(0, -1);
      buffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      return drain();
    },
    // Call once when the stream ends. It resolves a trailing CR and returns any last frames.
    flush(): SseFrame[] {
      if (pendingCr) {
        buffer += "\n";
        pendingCr = false;
      }
      return drain();
    },
  };
}
