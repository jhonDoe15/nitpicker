export interface Repository {
  load(): string;
  save(value: string): void;
}

export interface Audit {
  log(): void;
  trace(): void;
}
