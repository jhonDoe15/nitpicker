class S38MissingDefault1 {
  boolean f(int i) {
    // BUG: Diagnostic contains:
    switch (i) {
      case 42:
        return true;
    }
    return false;
  }
}
