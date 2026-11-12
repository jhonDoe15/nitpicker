export interface Settings {
  host: string;
  port: number;
  secure: boolean;
  retries: number;
  timeout: number;
  label: string;
}

export type Mode = 'fast' | 'slow' | 'off';

export class Session {
  open(): void {}

  write(text: string): void {
    void text;
  }

  commit(): void {}

  rollback(): void {}
}

export class Account {
  balance = 0;
  frozen = false;

  deposit(amount: number): void {
    this.balance += amount;
  }
}

export class Toolkit {
  parseName(text: string): string {
    return text.trim();
  }

  parseAge(text: string): number {
    return Number(text);
  }

  renderName(name: string): string {
    return `<${name}>`;
  }

  renderAge(age: number): string {
    return String(age);
  }
}
