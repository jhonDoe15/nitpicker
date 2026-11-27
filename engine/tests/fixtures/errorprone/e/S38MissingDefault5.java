class S38MissingDefault5 {
  boolean f(int i) {
    switch (i) {
      case 42:
        return true;
      default: // fall out
    }
    return false;
  }
}
