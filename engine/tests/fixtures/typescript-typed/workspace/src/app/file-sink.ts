import type { Sink } from '../lib/sinks';

export class FileSink implements Sink {
  write(): void {}

  flush(): void {}
}
