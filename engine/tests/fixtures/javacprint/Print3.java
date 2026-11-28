class Print3 {
  void m() {
    f((@A String) x, (final int a) -> a, (@A int a) -> a, (java.util.Map<? extends K, ? super V>) m, (Outer<String>.Inner) i, (Map.Entry<K, V>) e, new Foo<>() {}, new int @A [3], "Aé", $x, (List<?>) l, (int[][]) a);
    f(x instanceof Box<String>(var s), (Object) (String) x, new Outer.Inner(), Outer.this.x, Outer.super.m(), Map.<K, V>of(), new int[] {}, new String[] {"a", "b"}, new Foo(), new Foo(1)
      .bar());
    f(switch (x) { case 1: yield 2; default: { yield 3; } }, (a) -> b -> c, () -> {}, x -> { }, (x) -> new Object() {}, a.new <T>B<C>(d));
    f(1e0, 100.0, 1234567.0, 12345678.0, 1.0e-3, 9.999e-4, 3.4028235e38f, 1.4e-45f, 0.3f, 1.1f, 16777217f, 0.1f + 0.2f, 2e-3, 1e23, 8.41e21, 5e-324);
  }

  void negatives(int x) {
    f(-2147483648, -9223372036854775808L, -5, -0x80000000, - 7, -(3), -1.5, x == -2147483648, -x);
  }
}
