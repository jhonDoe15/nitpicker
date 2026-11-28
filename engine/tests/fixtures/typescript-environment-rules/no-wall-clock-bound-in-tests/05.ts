let start;
let end;
it('measures twice', () => {
  start = +new Date();
  run();
  end = new Date().getTime();
  let elapsed = end - start;
  expect(elapsed).toBeLessThan(300);
  elapsed = 0;
  expect(elapsed).toBeLessThan(300);
  expect(start - end).toBeLessThan(300);
});
