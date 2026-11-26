import java.util.function.Function;

public class B3Capital {
  private int foo;
  private String barBaz;
  static final int MAX_VALUE = 1;
  static int Static = 2;
  final int other = 3;

  B3Capital(int Foo) {
    this.foo = Foo;
  }

  void set(String barbaz) {
    barBaz = barbaz;
    foo = foo + 1;
  }

  void same(int foo, String BARBAZ) {
    System.out.println(foo + BARBAZ);
  }

  void upper(int max_value, int STATIC) {}

  void lambda() {
    Function<Integer, Integer> f = FOO -> FOO + foo;
    Function<Integer, Integer> g = (FOO) -> FOO + foo + this.foo;
  }

  void shadowed(int Foo, int foo2) {
    int x = foo;
  }

  class Inner {
    void m(int FOO) {
      int y = foo + FOO;
    }
  }

  static class Sub extends B3Capital {
    Sub() {
      super(1);
    }

    void m(int FOO) {}
  }

  void anonymous() {
    new Object() {
      void m(int Foo) {
        int y = foo;
      }
    };
  }

  @SuppressWarnings("InconsistentCapitalization")
  static class Quiet {
    int value;

    void m(int Value) {}
  }

  static class MethodQuiet {
    int value;

    @SuppressWarnings("InconsistentCapitalization")
    void m(int Value) {}
  }

  record R(int abc) {
    void m(int ABC) {}
  }

  interface I {
    int count = 0;
    int LIMIT = 1;

    void m(int COUNT, int limit);
  }

  enum E {
    A;
    int level;

    void m(int LEVEL) {}
  }

  abstract static class Abs {
    int total;

    abstract void m(int Total);
  }
}
