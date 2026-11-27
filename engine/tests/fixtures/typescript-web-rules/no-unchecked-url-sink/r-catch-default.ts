function f(m) {
  const items = [{ url: "a" }];
  try {} catch ({ items, a = items.map((i) => window.open(i.url)) }) {}
}
