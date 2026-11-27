class F43Fs11 {
  void f() {
    // BUG: Diagnostic contains: missing argument for format specifier
    "%s %s %s".formatted("foo", "baz");
  }
}
