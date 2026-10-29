export class Cart {
  private items: string[] = [];
  readonly config = { limit: 3 };

  add(item: string): void {
    this.items.push(item);
  }

  lines(): string[] {
    return this.items;
  }

  snapshot(): string[] {
    return [...this.items];
  }

  mixed(flag: boolean): string[] {
    if (flag) {
      return this.items;
    }
    return [];
  }

  settings(): { limit: number } {
    return this.config;
  }

  ready(): boolean {
    return this.items.length > 0;
  }
}

export class Session {
  open(): void {}

  write(text: string): void {
    void text;
  }

  commit(): void {}

  rollback(): void {}
}
