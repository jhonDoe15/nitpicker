package p;

public class W {
    static boolean flag;
    boolean c, d;
    int x;

    private void m1() {
      if (p.W
              .flag) {
      }
    }

    void m2() {
        if (c) {}
        x++;
        if (d) {
        }
        x++;
    }

    void m3() {
        if (c
            || d) {
        }
    }

    void m4() {
        if (foo(
              1)) {
        }
    }

    boolean foo(int i) { return c; }

    void m5() {
        if (c) {
        } x++;
    }
}
