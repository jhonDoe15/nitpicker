beforeEach(() => {
  vi.useFakeTimers();
});
it('runs on fake time', () => {
  const start = Date.now();
  expect(Date.now() - start).toBeLessThan(100);
});
