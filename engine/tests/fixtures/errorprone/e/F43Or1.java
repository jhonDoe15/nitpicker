class F43Or1 {
  void f() {
    // BUG: Diagnostic contains:
    System.err.println("%s");
    // BUG: Diagnostic contains:
    new Exception("%s");
    // BUG: Diagnostic contains:
    new StringBuilder("%s");
    // BUG: Diagnostic contains:
    new StringBuilder().append("%s", 0, 0);
  }
}
