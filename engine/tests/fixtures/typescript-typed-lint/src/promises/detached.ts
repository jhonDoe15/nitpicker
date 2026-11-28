import * as jobs from './jobs';
import { runDetached, sendRaw, sendReport } from './jobs';

declare function report(id: string): Promise<void>;
declare function count(): number;

export function start(job: Promise<void> | undefined) {
  void sendReport('a');
  void jobs.sendReport('a');
  void sendRaw('a');
  void jobs.sendRaw('a');
  void runDetached(() => report('a'));
  void report('a');
  void job;
  void count();
  void (async () => {
    await report('b');
  })();
}
