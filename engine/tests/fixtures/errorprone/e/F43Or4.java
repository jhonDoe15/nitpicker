class F43Or4 {
  void f() {
    // BUG: Diagnostic contains:
    StringBuilder messageBuilder = new StringBuilder("more than 50% finished");
  }
}
