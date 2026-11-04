export class Handle {
  [Symbol.dispose](): void {}

  write(): void {}
}

export function useHandle(): void {
  using handle = new Handle();
  handle.write();
}
