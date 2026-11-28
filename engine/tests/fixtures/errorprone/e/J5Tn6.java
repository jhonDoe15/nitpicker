

class J5Tn6 {
  // BUG: Diagnostic contains: Type parameter J5Tn5 shadows visible type foo.bar.T
  class FooInner<J5Tn5> {
    void bar(J5Tn5 t) {}
  }
}
