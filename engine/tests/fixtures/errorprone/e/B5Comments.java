package e;

class B5Comments {
  static void target(int first, String second, boolean third) {}

  static void many(String... names) {}

  B5Comments(int size, String label) {}

  B5Comments() {
    this(/* size */ 1, "x");
  }

  void calls() {
    target(/* first */ 1, "a", true);
    target(1 /* second */, "a", true);
    target(1, /* second= */ "a", true);
    target(/*first=*/ 1, "a", true);
    target(1, "a", /*third*/ true);
    target(1, "a", true /* third */);
    target(1, "a", true); // third
    target(/* first */ 1, /* second */ "a", /* third */ true);
    target(
        1, // first
        "a", // second
        true); // third
    target(
        /* first */ 1,
        "a",
        true);
    target(1, "a", true /* other */);
    target(1, /* misc */ "a", true);
    target(1 /* first */, "a", true);
    new B5Comments(/* size */ 1, "x");
    new B5Comments(1, /* label */ "x");
    new B5Comments(/* size= */ 1, /* label= */ "x");
    many("a", /* names */ "b");
    many(/* names */ "a", "b", /* names */ "c");
    target(/* first */ 1, "a", true) /* trailing */;
    target(1, "a",
        // third
        true);
    target(/* first */ foo(/* nested */ 1), "a", true);
    target(1, "a", /* third */ true);
    int x = 1; // note
  }

  static int foo(int unnamed) {
    return unnamed;
  }
}
