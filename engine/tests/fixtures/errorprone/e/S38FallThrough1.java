class S38FallThrough1 {
  void f(int x) {
    switch (x) {
      case 1:
        for (; ; ) {}
      case 2:
        break;
    }
  }
}
