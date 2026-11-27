class S38SwitchDefault6 {
  boolean f(int i) {
    switch (i) {
      case 0:
        return true;
      default: // fall through
      case 1: // fall through
    }
    return false;
  }
}
