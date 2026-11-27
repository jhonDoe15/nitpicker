class S38FallThrough5 {
  enum Case {
    ONE,
    TWO
  }

  void m(Case c) {
    switch (c) {
      case ONE:
        switch (c) {
          case ONE -> m(c);
          case TWO -> m(c);
        }
      // fall through
      default:
        assert false;
    }
  }
}
