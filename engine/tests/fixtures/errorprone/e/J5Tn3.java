

class J5Tn3 {
  class T {}

  // BUG: Diagnostic contains: Type parameter T shadows visible type foo.bar.Foo$T
  class Bar<T> {
    void bar(T t) {}
  }
}
