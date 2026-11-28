class S38MissingDefault9 {
  void m(int i) {
    // BUG: Diagnostic contains:
    switch (i) {
      case 1 -> {}
      case 2 -> {}
    }
  }
}
