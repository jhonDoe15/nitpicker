import static org.junit.Assert.assertThrows;

class S21AssertThrows {
  void f() {
    assertThrows(
        IllegalStateException.class,
        () -> {
          System.err.println();
        });
    IllegalStateException e =
        assertThrows(
            IllegalStateException.class,
            () -> {
              System.err.println(1);
              System.err.println(2);
            });
    assertThrows(
        IllegalStateException.class,
        () -> {
          int x = 2;
          int y = x;
        });
  }

  void g() {
    assertThrows(IllegalStateException.class, () -> {});
    assertThrows(
        IllegalStateException.class,
        () -> {
          int x = 1;
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          if (true) {
            System.err.println();
          }
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          try {
            System.err.println();
          } catch (Exception e) {
          }
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          {
            System.err.println();
          }
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          return;
        });
  }

  void h() {
    assertThrows(
        IllegalStateException.class,
        () -> {
          int a = 1, b = 2;
          System.err.println(a);
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          int a = 1, b = 2;
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          System.err.println(1);
          if (true) {
            System.err.println(2);
          }
        });
  }

  @SuppressWarnings("AssertThrowsMultipleStatements")
  void suppressed() {
    assertThrows(
        IllegalStateException.class,
        () -> {
          System.err.println(1);
          System.err.println(2);
        });
  }
}
