export class Counter {
  #count = 0;

  static create(): Counter {
    return new Counter();
  }

  constructor(private readonly step = 1) {
    if (step < 0) {
      throw new Error('negative');
    }
  }

  get value(): number {
    return this.#count;
  }

  set value(next: number) {
    this.#count = next > 0 ? next : 0;
  }

  increment(): void {
    this.#count += this.step;
  }

  #reset(): void {
    this.#count = 0;
  }

  clear(): void {
    this.#reset();
  }

  handler = (event?: { delta?: number }): number => event?.delta ?? 1;

  ['computed' + 'Name'](): number {
    return 1;
  }
}

export function plain(a: number, b: number): number {
  return a > b && b > 0 ? a : b || 0;
}

export default function (flag: boolean): string {
  return flag ? 'yes' : 'no';
}

export const arrow = (items: string[]): number => {
  let total = 0;
  for (const item of items) {
    if (item) {
      total += 1;
    }
  }
  return total;
};

export const registry = {
  run() {
    return 1;
  },
  nested: {
    deep(): number {
      return 2;
    },
    lazy: () => 3,
  },
  async load(): Promise<number> {
    return 4;
  },
};

export const table = {
  switchy(kind: string): number {
    switch (kind) {
      case 'a':
        return 1;
      case 'b':
        return 2;
      default:
        return 3;
    }
  },
};

export function overloaded(value: string): string;
export function overloaded(value: number): number;
export function overloaded(value: string | number): string | number {
  return value;
}

export function withTry(text: string): number {
  try {
    return JSON.parse(text).length ?? 0;
  } catch {
    return -1;
  }
}

export function callbacks(list: number[]): number[] {
  return list.map((item) => (item > 1 ? item : 0)).filter((item) => item);
}

export const holder: { fn?: () => number } = {};
holder.fn = function () {
  return 1;
};

export function sleepThenFind(items: string[]): Promise<string | undefined> {
  return new Promise((resolve) => setTimeout(() => resolve(items.find((item) => item.length > 1)), 0));
}

export function neverCalled(a: number): number {
  if (a > 1) {
    return a;
  }
  return a < 0 ? -a : a;
}

export function interfaceOnly(): void {
  interface Unused {
    name: string;
  }
}
