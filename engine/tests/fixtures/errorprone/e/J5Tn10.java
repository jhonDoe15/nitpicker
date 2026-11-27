

// BUG: Diagnostic contains: Type parameter J5Tn9 shadows visible type foo.bar.T
class J5Tn10<J5Tn9, U, V> {
  void bar(J5Tn9 t, U u, V v) {}
}
