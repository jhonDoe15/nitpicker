export async function readStandardInput(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    const bytes: unknown = chunk;
    if (Buffer.isBuffer(bytes)) {
      chunks.push(bytes);
    }
  }
  return Buffer.concat(chunks);
}
