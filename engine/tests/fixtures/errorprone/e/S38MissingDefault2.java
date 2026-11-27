class S38MissingDefault2 {
  void f(int i) {
    // BUG: Diagnostic contains:
    switch (i) {
      case 42:
        System.err.println(42);
    }
  }
}
