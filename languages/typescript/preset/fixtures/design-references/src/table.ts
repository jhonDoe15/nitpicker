import { isCount, isText, optional, shout, whisper } from './helpers';

const SHAPE = { name: isText, size: optional(isCount) };
const VOICES = { loud: shout, quiet: whisper };
const LIMIT = 3;

export function speak(voice: 'loud' | 'quiet', text: string): string {
  return VOICES[voice](text);
}

export function check(value: unknown): boolean {
  return SHAPE.name(value) && LIMIT > 0;
}

export function filtered(values: unknown[]): unknown[] {
  return values.filter(isText);
}

export function chooser(): (text: string) => string {
  return shout;
}

export function bound(): () => string {
  return whisper.bind(undefined, 'x');
}

export function compared(handler: unknown): boolean {
  return handler === shout;
}

export function called(): string {
  return shout('x');
}

export function recursive(depth: number): unknown[] {
  return depth > 0 ? [recursive] : [];
}

export class Handler {
  handle(): void {}

  register(list: Array<() => void>): void {
    list.push(this.handle);
  }
}
