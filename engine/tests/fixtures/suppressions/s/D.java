package s;

class D {
  int a(String s) {
    if (s.isEmpty()) { // NOPMD
      return 1;
    }
    if (s.isBlank()) {
      return 2; // NOPMD
    } // NOPMD
    return s
        .trim() // NOPMD
        .length();
  }

  int b( // NOPMD
      String s) {
    return s.strip().length(); // NOPMD
  }

  @Deprecated // NOPMD
  int c() {
    return 0;
  }

  int // NOPMD
      d() {
    return 0;
  }

  @SuppressWarnings("PMD.Q") // why
  int e(String s) { return s.length(); }

  int f(String s) { return s.length(); } // NOPMD - text
}
