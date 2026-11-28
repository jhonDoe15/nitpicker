it('stamps the order', () => {
  const order = { at: new Date(), id: Math.random() };
  expect(order.at.getTime()).toBeLessThanOrEqual(Date.now());
});
