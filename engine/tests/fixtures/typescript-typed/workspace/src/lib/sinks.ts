import type { Audit } from '../app/ports';

export interface Sink {
  write(): void;
  flush(): void;
}

export class ConsoleSink implements Sink, Audit {
  write(): void {}

  flush(): void {}

  log(): void {}

  trace(): void {}
}
