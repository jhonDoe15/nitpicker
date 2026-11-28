test.each([1, 2])('case %i', (value) => {
  expect(value).toBeGreaterThan(0);
});
