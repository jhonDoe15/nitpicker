class S38MissingDefault7 {
  boolean f(int i) {
    switch (i) {
      default:
      case 42:
        return true;
    }
  }
}
