class S38FallThrough2 {
  void f(int x) {
    switch (x) {
      case 0:
        {
          // fall through
        }
      case 1:
        {
          System.err.println();
          // fall through
        }
      case 2:
        break;
    }
  }
}
