it('is not a bound', () => {
  const start = Date.now();
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(5000);
  expect(elapsed).not.toBeLessThan(10);
  expect(elapsed).toBeGreaterThan(10);
  const mixed = performance.now() - start;
  expect(mixed).toBeLessThan(10);
});
