function f() {
  const u = new URL(x, "http://a");
  if (u.origin !== "http://a") return;
  try {} catch ({ u, a = redirect(u.pathname) }) {}
}
