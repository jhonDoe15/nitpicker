import { waitFor } from '@testing-library/react';
import { mock } from 'node:test';
import sinon from 'sinon';
import FakeTimers from '@sinonjs/fake-timers';

it('fake', async () => {
  vi.useFakeTimers();
  await vi.waitFor(check);
  await waitFor(check);
});

it('node', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  await waitFor(check);
  t.mock.timers.enable();
});

it('sinon', async () => {
  const clock = sinon.useFakeTimers();
  await waitFor(check);
  const installed = FakeTimers.install();
  await waitFor(check);
});

describe('fake', () => {
  beforeEach(() => jest.useFakeTimers());
  describe('nested', () => {
    it('wait', async () => {
      await waitFor(check);
    });
  });
});

it('real', async () => {
  await waitFor(check);
  await vi.waitFor(check);
});

it('restored', async () => {
  jest.useFakeTimers();
  jest.useRealTimers();
  await waitFor(check);
});

it('advances', async () => {
  jest.useFakeTimers();
  await jest.advanceTimersByTimeAsync(5);
});

afterEach(() => jest.useFakeTimers());

beforeEach(function () {
  this.clock = sinon.useFakeTimers();
});

it('this clock', async function () {
  this.clock.restore();
  await waitFor(check);
});

it('stub', async () => {
  sinon.stub(api, 'load');
  await waitFor(check);
});
