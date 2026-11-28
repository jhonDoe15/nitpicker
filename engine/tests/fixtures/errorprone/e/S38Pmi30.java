package pmi30;

class T {
  interface Filter {
    Object child();
  }

  int f(Object o) {
    return switch (o) {
      case Filter filter -> {
        if (!(filter.child() instanceof Integer)) {
          yield 0;
        }
        yield 1;
      }
      default -> 2;
    };
  }
}
