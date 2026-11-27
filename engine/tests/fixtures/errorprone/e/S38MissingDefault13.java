class S38MissingDefault13 {
  void f(int i) {
    switch (i) {
      case 0 -> System.err.println(i);
    }
  }
}
