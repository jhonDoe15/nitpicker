function f(req) {
  let h = req.headers["content-type"];
  (h satisfies any) = "x";
  if (h === "Application/json") {}
}