class F43Fs2 {
  void f() {
    // BUG: Diagnostic contains: missing argument for format specifier '%s'
    String.format("%s %s %s", 42);
    // BUG: Diagnostic contains: missing argument for format specifier '%s'
    String.format("%s %s %s", 42, 42);
    String.format("%s %s %s", 42, 42, 42);
  }
}
