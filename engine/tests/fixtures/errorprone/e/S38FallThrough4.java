class S38FallThrough4 {
  enum Case {
    ONE,
    TWO
  }

  void m(Case c) {
    switch (c) {
      case ONE -> {}
      case TWO -> {}
      default -> {}
    }
  }
}
