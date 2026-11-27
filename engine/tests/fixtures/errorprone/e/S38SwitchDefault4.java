class S38SwitchDefault4 {
  boolean f(int i) {
    switch (i) {
      default:
        return false;
      case 0:
      case 1:
        System.err.println();
    }
    return true;
  }
}
