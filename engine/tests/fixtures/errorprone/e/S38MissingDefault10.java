class S38MissingDefault10 {
  void m(int i) {
    switch (i) {
      case 1 -> {}
      case 2 -> {}
      default -> {} // fall out
    }
  }
}
