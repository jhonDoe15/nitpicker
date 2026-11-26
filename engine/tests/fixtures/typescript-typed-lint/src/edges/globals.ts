interface Math { readonly tau: number }
declare const samples: number[];
Math.max(...samples);

async function settle<T>(): Promise<T | undefined> {
  try {
    return await Promise.resolve(undefined);
  } catch {
    return undefined;
  }
}

function start(): void {
  void (settle<number>)();
}

class Ledger {
  2n(amount: number): number {
    return this.total(amount);
  }

  total(amount: number): number {
    return amount;
  }
}

start();
new Ledger();
