// Runs the app as a process.
import { AppProcess } from '../support/harness';

it('runs the app', async () => {
  await AppProcess.run();
});
