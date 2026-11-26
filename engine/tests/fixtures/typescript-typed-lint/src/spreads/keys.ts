type Data = { id?: string; name?: string; kind: string };
type RunOptions = { mode?: string; retries?: number; name: string };
interface SaveOptions {
  mode?: string;
}
interface SaveConfig {
  mode?: string;
}

export function explicitFirst(id: string, data: Data): Data {
  return { id, ...data };
}

export function nested(start: { codexConfig: RunOptions }): RunOptions {
  return { ...start.codexConfig, mode: 'detailed' };
}

export function defaultAfter(options: RunOptions): RunOptions {
  return { ...options, retries: 3 };
}

export function unions(options: SaveConfig | SaveOptions): SaveOptions {
  return { ...options, mode: 'fast' };
}

export function fine(id: string, data: Data, options: RunOptions, overrides: Data): readonly unknown[] {
  return [
    { ...data, id },
    { id: 'fixed', ...data },
    { id: data.id, ...data },
    { id, ...overrides },
    { ...options, name: 'n' },
    { ...options, mode: options.mode ?? 'detailed' },
  ];
}
