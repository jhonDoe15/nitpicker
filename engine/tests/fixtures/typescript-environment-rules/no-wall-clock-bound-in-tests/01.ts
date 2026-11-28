it('is fast', async () => {
  const start = Date.now();
  await run();
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(500);
  expect(Date.now() - start).toBeLessThanOrEqual(2 * 100);
  expect(elapsed < 200).toBe(true);
});
