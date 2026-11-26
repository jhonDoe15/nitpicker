declare function report(id: string): Promise<void>;
declare const logger: { error(value: unknown): void };

export async function sendReport(id: string): Promise<void> {
  try {
    await report(id);
  } catch (error) {
    logger.error({ error });
  }
}

export async function sendRaw(id: string): Promise<void> {
  await report(id);
}

export function runDetached(task: () => Promise<void>): Promise<void> {
  return task();
}
