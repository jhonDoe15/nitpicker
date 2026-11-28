import type { Sink } from './sinks';

export function emit(sink: Sink): void {
  sink.write();
}
