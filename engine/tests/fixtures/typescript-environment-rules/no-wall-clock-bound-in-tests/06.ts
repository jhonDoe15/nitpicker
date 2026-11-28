Date.now = () => 0;
it('is replaced', () => {
  const start = Date.now();
  expect(Date.now() - start).toBeLessThan(100);
});
