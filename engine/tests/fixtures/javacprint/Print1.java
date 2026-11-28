class Print1 {
  void m() {
    f("a" + "b", "a" + "b" + x, x + "a" + "b", "a" + x + "b" + "c", "a" + 1 + "b", ("a" + "b") + "c", "a" + ("b" + "c"));
    f(0x10, 010, 0b11, 1_000, 2147483647, 0x80000000, 1L, 0xFFL, 077L, 1.0, 1.5f, 1e10, 1e10f, 0.1, 1e-5, 123456789.0, 1e7, 9999999.0, 0.001, 0.0001, 1d, 2D, 3F, .5, 5., 0x1p3, 0x1.8p1f, 1e300, 4.9e-324);
    f('a', '\n', '\'', '"', '\\', 'A', '\0', '\t', 'é', ' ', '\177', ' ', '~');
    f("tab\there", "quote\"s", "sq'", "back\\slash", "nl\n", "cr\r", "ff\f", "bs\b", "nul\0", "été", "\177", " ", "é", "😀", "\s");
    f("""
      text block
        indented "q"
      end""");
    f(a.b.c, a[0], a[i + 1][j], this, P1.this, super.x, int.class, String[].class, java.util.List.class, a.<String>b(), new int[3], new int[]{1, 2}, new int[][]{{1}, {}}, new int[3][], new String[0].length);
    f(new Foo(), new Foo<>(), new Foo<String>(1, 2), outer.new Inner(), new <T>Foo(), new java.util.ArrayList<java.lang.String>());
    f(-x, !b, ~i, +x, ++i, i++, --i, i--, - -x, -(-x), (x), ((x)), a = b, a += 1, a >>>= 2, c ? d : e, c ? d ? 1 : 2 : 3, x instanceof String, x instanceof String s, x instanceof final String s, (String) x, (java.util.List<String>) x, (int) 1.5, (A & B) x);
    f(a -> a, (a) -> a, (a, b) -> a, (int a, int b) -> a, () -> 1, (var a) -> a, Foo::bar, Foo::new, Foo::<String>bar, int[]::new, super::m, this::m, java.util.List<String>::size);
    f(a && b || c, a & b | c ^ d, a << 1, a >> 2, a >>> 3, a == b, a != b, a <= b, a % b, a * (b + c), (a * b) + c, a - (b - c));
    f(/* c */ x, x /* c */, x // c
      );
    f(a.<String, Integer>b(), List.<String>of(), x.y().z(), x .y. z, @A String.class);
    f(new Object() { int x; }, switch (x) { case 1 -> "a"; default -> "b"; });
    f((Runnable & java.io.Serializable) () -> {}, (a) -> { return a; });
    f(x instanceof Point(int a, int b), x instanceof Point(var a, Point(int c, int d)));
    f(1 + 2, "" + 'c', 'a' + 'b', "a" + 'b', "a" + null, "x" + true, "a" + "b" - 1);
  }
}
