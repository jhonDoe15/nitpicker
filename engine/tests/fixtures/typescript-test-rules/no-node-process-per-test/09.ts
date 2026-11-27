import { execa } from 'execa';
it('runs the bin', async () => { await execa(process.execPath, ['bin/cli.js']); });