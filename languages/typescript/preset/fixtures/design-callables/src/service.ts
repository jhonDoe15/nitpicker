import { Base, Config } from './base';
import type { Listener, Mode, Options } from './base';

declare function register(name: string, callback: (value: string) => void): void;

function logged(_target: unknown, _context: ClassMethodDecoratorContext): void {}

function retry(task: () => void): void {
  task();
}

export class Service extends Base implements Listener {
  constructor(
    private config: Config,
    readonly name: string,
  ) {
    super();
  }

  override run(): void {}

  handle(value: string): void {
    retry(() => {
      this.config.host = value;
    });
  }

  other(): void {}

  @logged
  decorated(): void {}

  [Symbol.iterator](): Iterator<string> {
    return [this.name][Symbol.iterator]();
  }

  static create(): Service {
    return new Service(new Config(), 'x');
  }
}

export function open(config: Config, options?: Options, ...rest: number[]): Service {
  return new Service(config, String(options?.retries ?? rest.length));
}

export function pick({ host }: Config, mode: Mode | undefined, list: Config[], tuple = 5): string {
  return `${host}${String(mode)}${String(list.length)}${String(tuple)}`;
}

export function main(): void {}

export default function page(): void {}

export const arrow = (config: Config): string => config.host;

export const untyped = (first, second = 'x') => first + second;

register('x', (value) => {
  retry(() => {
    value.trim();
  });
});

retry(() => {});
