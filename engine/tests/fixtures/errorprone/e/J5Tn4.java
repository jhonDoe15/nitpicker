

class J5Tn4 {
  public static class T {}

  // BUG: Diagnostic contains: Type parameter T shadows visible type foo.bar.Foo$T
  class Bar<T> {
    void bar(T t) {}
  }
}
