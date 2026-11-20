export interface Store {
  load(id: string): string;
  save(id: string, value: string): void;
  remove(id: string): void;
  __reset(): void;
  __flush(): void;
  __drain(): void;
  size: number;
  onChange: (id: string) => void;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

interface Hidden {
  peek(): void;
}

export class MemoryStore implements Store, Hidden {
  size = 0;
  onChange = (id: string): void => {
    this.remove(id);
  };
  load(id: string): string {
    this.__reset();
    return id;
  }
  save(id: string, value: string): void {
    this.size = id.length + value.length;
  }
  remove(_id: string): void {}
  __reset(): void {}
  __flush(): void {}
  __drain(): void {}
  peek(): void {}
}

export namespace Timing {
  export interface Ticker {
    tick(): void;
    stop(): void;
  }
}
