class S39NullablePrimitive5 {
  // BUG: Diagnostic contains:
  @S39NullablePrimitive4 int x;

  // BUG: Diagnostic contains:
  @S39NullablePrimitive4
  int f() {
    return 42;
  }

  <@S39NullablePrimitive4 T> int g() {
    return 42;
  }

  int @S39NullablePrimitive4 [] y;
}
