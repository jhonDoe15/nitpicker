import sinon from 'sinon';
it('picks a winner', () => {
  sinon.stub(Math, 'random').returns(0.5);
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  expect(pick([1, 2], Math.random())).toBe(1);
  expect(Date.now()).toBeGreaterThan(0);
});
