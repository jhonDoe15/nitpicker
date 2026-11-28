package p;
import java.util.*;
public class B {
    int f; static int sf; final int ff = 3;
    static Object make() { return new Object(); }
    static int num() { return 3; }
    void use(Object o) {}
    void m01() {
        Object x = make();
        x = null;
    }
    void m02() {
        Object x = make();
        use(x);
        x = null;
    }
    void m03() {
        Object x = null;
        use(x);
        x = make();
    }
    void m04() {
        int x = num();
        x = 0;
    }
    void m05() {
        int x = num();
        use(x);
        x = 0;
    }
    void m06() {
        int x = num();
        use(x);
        x = 7;
    }
    void m07() {
        int x = num();
        x = num();
    }
    void m08() {
        int x = num();
        x = num();
        use(x);
    }
    void m09() {
        for (int i = 0; i < 3; i++) {
            int t = num();
            use(t);
        }
    }
    void m10() {
        for (int i = 0; i < 3; i++) {
            int t = num();
        }
        use(1);
    }
    void m11() {
        int x = sf;
    }
    void m12() {
        int x = ff;
    }
    void m13() {
        int x = num() * 2;
        use(x);
        x = num();
    }
    void m14() {
        String s = "a" + num();
        use(s);
        s = "b";
    }
    void m15() {
        Object o = new Object();
        use(o);
        o = new Object();
    }
    void m16() {
        int x = num();
        int y = x;
    }
    void m17(int a) {
        use(a);
        a = num();
    }
    void m18(Object a) {
        a = new Object();
    }
    void m19() {
        int x = num();
        if (f > 0) {
            x = num();
        }
    }
    void m20() {
        int x;
        if (f > 0) {
            x = num();
        } else {
            x = 2;
        }
    }
    void m21() {
        int x;
        if (f > 0) {
            x = 1;
        } else {
            x = num();
        }
    }
    void m22() {
        int x = num();
        x++;
        use(x);
        x++;
    }
    void m23() {
        int x = num();
        use(x);
        x += 5;
    }
    void m24() {
        String s = null;
        s = String.valueOf(f);
        use(s);
        s = null;
    }
    void m25() {
        int x = 3;
        use(x);
        x = 4;
    }
    void m26() {
        Object x = this;
        use(x);
        x = this;
    }
    void m27() {
        int[] a = {1, 2};
    }
    void m28() {
        Object x = (Object) make();
    }
    void m29() {
        String s = (String) make();
    }
    void m30() {
        int x = num(), y = num();
        use(x);
    }
    final int m31() {
        int r;
        return r = num();
    }
    void m32() {
        int x = f;
        use(x);
        x = f;
    }
    void m33() {
        long x = System.nanoTime();
    }
    void m34() {
        Object x = make();
        Object y = x;
    }
}
