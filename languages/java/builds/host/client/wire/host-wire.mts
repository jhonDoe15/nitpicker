const HEADER_BYTES = 4;

type Decoded = { readonly frames: readonly Buffer[]; readonly used: number };

export function encode(request: readonly string[]): Buffer {
  const frames = request.map((text) => Buffer.from(text, 'utf8'));
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeInt32BE(frames.length);
  return Buffer.concat([
    header,
    ...frames.flatMap((frame) => {
      const length = Buffer.alloc(HEADER_BYTES);
      length.writeInt32BE(frame.length);
      return [length, frame];
    }),
  ]);
}

function nextFrame(buffer: Buffer, { frames, used }: Decoded): Decoded | undefined {
  const end = used + HEADER_BYTES;
  if (buffer.length < end) {
    return undefined;
  }
  const frameEnd = end + buffer.readInt32BE(used);
  return buffer.length < frameEnd
    ? undefined
    : { frames: [...frames, buffer.subarray(end, frameEnd)], used: frameEnd };
}

export function decode(buffer: Buffer): Decoded | undefined {
  if (buffer.length < HEADER_BYTES) {
    return undefined;
  }
  const count = buffer.readInt32BE(0);
  return Array.from({ length: count }).reduce<Decoded | undefined>(
    (state) => (state === undefined ? undefined : nextFrame(buffer, state)),
    { frames: [], used: HEADER_BYTES },
  );
}
