class S38MissingDefault8 {
  boolean f(int i) {
    // BUG: Diagnostic contains:
    switch (i) {
      case 42:
        System.err.println();
        return true;
    }
    return false;
  }
}
