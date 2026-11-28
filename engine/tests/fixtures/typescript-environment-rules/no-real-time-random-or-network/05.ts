jest.setSystemTime(new Date('2020-01-01'));
const spy = jest.spyOn(Math, 'random');
it('is stable', () => {
  expect(Date.now()).toBe(1577836800000);
  expect(Math.random()).toBe(spy.mock.results[0]);
  expect(Math['random']()).toBeLessThan(1);
});
