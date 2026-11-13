import { describe, expect, it } from 'vitest';
import { analyzeGoSnapshot } from './go-runner.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

function messagesOf(spawn) {
  return analyzeGoSnapshot({ projectRoot: process.cwd(), spawn, environment: {} }).findings.map(
    ({ rule, message }) => ({ rule, message }),
  );
}

describe('the Go tool errors', () => {
  it('link the entry for a go that is not on the PATH', () => {
    const missing = () => ({
      error: Object.assign(new Error('spawn go ENOENT'), { code: 'ENOENT' }),
    });

    expect(messagesOf(missing)).toEqual([
      {
        rule: 'go-missing',
        message: `go was not found on the PATH: install Go (https://go.dev/dl/) or put its bin folder on the PATH. ${linkSentence('goMissing')}`,
      },
    ]);
  });

  it('link the entry for a go command that exits with an error', () => {
    const failing = (program, arguments_) =>
      arguments_[0] === 'version'
        ? { status: 0, stdout: 'go version go1.26.0 linux/amd64\n', stderr: '' }
        : { status: 1, stdout: '', stderr: 'go: errors parsing go.mod' };

    const [first] = messagesOf(failing);

    expect(first.rule).toBe('go-env-failed');
    expect(first.message).toBe(
      `go env exited 1:\ngo: errors parsing go.mod\n${linkSentence('goModuleFails')}`,
    );
  });
});
