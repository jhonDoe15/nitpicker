class S38MissingDefault6 {
  boolean f(int i) {
    switch (i) {
      case 42:
        return true;
      default:
    }
    return false;
  }
}
