export type Release = () => void;

export type Semaphore = { readonly acquire: (weight: number) => Promise<Release> };

type Waiter = { readonly weight: number; readonly resolve: (release: Release) => void };

export function createWeightedSemaphore(capacity: number): Semaphore {
  let available = capacity;
  const waiting: Waiter[] = [];

  function release(weight: number): void {
    available += weight;
    drain();
  }

  function drain(): void {
    for (const waiter of [...waiting]) {
      if (waiter.weight > available) {
        return;
      }
      waiting.shift();
      available -= waiter.weight;
      waiter.resolve(() => {
        release(waiter.weight);
      });
    }
  }

  return {
    acquire(weight: number): Promise<Release> {
      return new Promise((resolve) => {
        waiting.push({ weight, resolve });
        drain();
      });
    },
  };
}
