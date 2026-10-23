import { describe, expect, it } from 'vitest';
import { runEachFileOnce } from './mocha-files.config.mjs';

function fakeMocha() {
  const runs = [];
  class FakeMocha {
    constructor(files) {
      this.files = files;
    }

    run(done) {
      runs.push(this.files);
      return done;
    }
  }
  return { FakeMocha, runs };
}

describe('the Mocha module that keeps each test file to one run', () => {
  it('drops the repeats of a file before Mocha runs, in first-seen order', () => {
    const { FakeMocha, runs } = fakeMocha();
    runEachFileOnce(FakeMocha);

    const result = new FakeMocha(['/p/test/b.js', '/p/test/a.js', '/p/test/b.js']).run('done');

    expect([result, runs]).toEqual(['done', [['/p/test/b.js', '/p/test/a.js']]]);
  });
});
