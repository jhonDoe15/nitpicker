export function createWeightedSemaphore(capacity) {
  let available = capacity;
  const waiting = [];

  function release(weight) {
    available += weight;
    drain();
  }

  function drain() {
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
    acquire(weight) {
      return new Promise((resolve) => {
        waiting.push({ weight, resolve });
        drain();
      });
    },
  };
}
