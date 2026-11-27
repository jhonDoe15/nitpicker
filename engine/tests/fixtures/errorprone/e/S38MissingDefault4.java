class S38MissingDefault4 {
  enum E {
    ONE,
    TWO
  }

  boolean f(E e) {
    switch (e) {
      case ONE:
        return true;
    }
    return false;
  }
}
