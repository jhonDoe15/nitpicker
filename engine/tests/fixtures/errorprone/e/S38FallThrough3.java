class S38FallThrough3 {
  void f(char c, boolean b) {
    switch (c) {
      case 'a':
        {
        }
      // fall through
      default:
    }
  }
}
