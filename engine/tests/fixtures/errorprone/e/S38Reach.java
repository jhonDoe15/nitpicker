import java.lang.ref.Reference;

class S38Reach {
  static final boolean ON = true;
  void a(int x) {
    switch (x) {
      case 1:
        foo();
      case 2:
        foo();
        // fall through
      case 3:
        foo();
        // Falls-through deliberately
      case 4:
        return;
      // fall through
      case 5:
        { foo(); }
      case 6:
        { foo(); /* fallthrough */ }
      case 7:
        while (true) { foo(); }
      case 8:
        while (ON) { if (x > 1) break; }
      case 9:
        do { foo(); } while (true);
      case 10:
        for (;;) { foo(); }
      case 11:
        for (int i = 0; ; i++) { if (i > 3) break; }
      case 12:
        System.exit(1);
      case 13:
        try { foo(); } finally { return; }
      case 14:
        try { return; } catch (RuntimeException e) { foo(); }
      case 15:
        synchronized (this) { throw new IllegalStateException(); }
      case 16:
        if (x > 3) { return; } else { throw new IllegalStateException(); }
      case 17:
        if (x > 3) { return; }
      case 18:
        L: { foo(); break L; }
      case 19:
        outer: while (true) { while (true) { break outer; } }
      case 20:
        switch (x) { case 1: return; default: return; }
      case 21:
        switch (x) { case 1: break; default: return; }
      case 22:
        switch (x) { case 1 -> foo(); default -> { return; } }
      case 23:
        switch (x) { case 1 -> { return; } default -> throw new IllegalStateException(); }
      case 24:
        do { if (x > 2) continue; return; } while (x > 0);
      case 25:
        int y = 3;
      case 26:
      case 27:
        foo(); // falls through
      case 28:
        foo(); /* falling through */
      case 29:
        foo(); // fallthroughs
      case 30:
        foo(); // FALL_THROUGH
      case 31:
        for (String s : new String[0]) { return; }
      case 32:
        return;
      case 33:
    }
  }

  void b(int x) {
    switch (x) {
      default:
        foo();
        break;
      case 1:
        foo();
    }
    switch (x) {
      case 1:
      default:
      case 2:
        foo();
        break;
      case 3:
        return;
    }
    switch (x) {
      case 1:
        foo();
        break;
      default:
    }
    switch (x) {
      case 1:
        foo();
        break;
      default:
        // nothing
    }
    switch (x) {
      case 1 -> foo();
      default -> {}
      case 2 -> foo();
    }
    switch (x) {
      case 1:
        return;
    }
    switch (x) {
      case 1:
        foo();
    }
    switch (x) {
      case 1:
    }
    switch (x) {
      case 1 -> foo();
      case 2 -> foo();
    }
    switch (x) {
    }
    switch ("a") {
      case "b":
        foo();
    }
  }

  void c(Object o, Integer boxed) {
    switch (o) {
      case String s -> foo();
      case Object other -> foo();
    }
    switch (boxed) {
      case 1 -> foo();
      case Integer i -> foo();
    }
    switch (boxed) {
      case 1 -> foo();
      case null -> foo();
      case Integer i -> foo();
    }
    switch (boxed) {
      case 1 -> foo();
    }
    int v = switch (boxed) {
      case 1: yield 1;
      default: yield 2;
    };
  }

  void d(Object o) {
    Reference.reachabilityFence(o);
    try {
      foo();
    } finally {
      Reference.reachabilityFence(o);
      Runnable r = () -> Reference.reachabilityFence(o);
      try {
        foo();
      } catch (RuntimeException e) {
        Reference.reachabilityFence(o);
      }
    }
    Object unused = new Object() {
      void e() {
        Reference.reachabilityFence(o);
      }
    };
  }

  @SuppressWarnings({"FallThrough", "MissingDefault"})
  void f(int x) {
    switch (x) {
      case 1:
        foo();
      case 2:
        foo();
    }
  }

  void foo() {}
}
