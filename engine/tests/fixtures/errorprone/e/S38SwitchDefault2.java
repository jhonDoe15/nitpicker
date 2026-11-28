class S38SwitchDefault2 {
  void f(int i) {
    switch (i) {
      case 2:
        return;
      case 1:
      case 0:
      default:
        return;
    }
  }
}
