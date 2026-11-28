type Options = { limit?: number; enabled?: boolean; title?: string; ratio?: 0 | 1 };

export function pageSize(limit?: number): number {
  return limit || 25;
}

export function label(name: string | undefined): string {
  return name ? name : 'none';
}

export function settings(options: Options, other: Options): readonly unknown[] {
  return [
    options.limit || 10,
    options.enabled || undefined,
    options.title || 'untitled',
    options.ratio || 1,
    options.limit ?? 10,
    other.enabled || options.enabled || true,
  ];
}

export function guarded(limit?: number, flag?: boolean): boolean {
  if (limit || flag) {
    return Boolean(limit || 0);
  }
  return !(limit || 3);
}

export function kept(count?: number, text?: string): readonly unknown[] {
  return [count || 0, text || '', count || ``];
}
