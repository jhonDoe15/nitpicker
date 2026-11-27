import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

public class J5Tx1 {
  interface T {}

  void a() {
    class Loc1<T> {}
  }

  Object f = new Object() {
    <T> void m() {}
  };

  void b() {
    class W {
      class Z {
        <T> void m() {}
      }
    }
  }

  void c() {
    class L<T, String> {
      T t;
    }
  }

  class Mem {
    interface U {}

    void d() {
      class Inside<T, U> {}
    }
  }

  @Target(ElementType.PARAMETER)
  @interface P {}

  record D(int a, @P int... c) {
    D(int a, int... c) {
      this.a = a;
      this.c = c;
    }
  }
}
