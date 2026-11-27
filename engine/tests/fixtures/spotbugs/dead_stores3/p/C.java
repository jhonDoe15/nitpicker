package p;
import java.util.*;
public class C {
    int f; String g; static String sg; static final int K = 4; static final String KS = "k"; static final Integer KI = 4;
    int[] arr = new int[2];
    enum E { A, B }
    static Object make() { return new Object(); }
    static int num() { return 3; }
    static long lnum() { return 3; }
    void use(Object o) {}
    void m01() {
        int x = num();
        long y = x;
    }
    void m02() {
        long x = lnum();
        long y = x;
    }
    void m03() {
        String x = String.valueOf(f);
        String y = x;
    }
    void m04(C o) {
        int y = o.f;
    }
    void m05(C o) {
        String y = o.g;
    }
    void m06() {
        String y = sg;
    }
    void m07() {
        int y = arr[0];
    }
    void m08() {
        int y = K;
    }
    void m09() {
        String y = KS;
    }
    void m10() {
        Integer y = KI;
    }
    void m11() {
        Integer y = 3;
    }
    void m12() {
        E y = E.A;
    }
    void m13() {
        final int c = 5;
        int y = c;
    }
    void m14() {
        int y = f > 0 ? 1 : 2;
    }
    void m15() {
        int y = 1 << 3;
    }
    void m16() {
        String y = (String) null;
    }
    void m17() {
        Runnable r = this::toString;
    }
    void m18() {
        int x = num();
        x++;
    }
    void m19() {
        int x = num();
        use(x);
        x++;
    }
    void m20() {
        int x = num();
        use(x);
        x += 2;
    }
    void m21() {
        int x = num();
        use(x);
        x--;
    }
    void m22() {
        int x = num();
        use(x);
        x = x + 1;
    }
    void m23() {
        int x, y;
        x = y = num();
        use(y);
    }
    void m24() {
        int y = Integer.MAX_VALUE;
    }
    void m25() {
        double d = Math.PI;
    }
    void m26() {
        int y = f;
        use(y);
        y = f;
    }
    void m27() {
        String y = g;
    }
    void m28() {
        int[] a = arr;
    }
    void m29() {
        Object o = make();
        Object y = o;
        use(o);
    }
    void m30() {
        boolean b = f > 0;
    }
    void m31() {
        int y = -num();
    }
    void m32() {
        char[] y = new char[0];
    }
    void m33() {
        List<String> l = List.of();
    }
    void m34() {
        Object y = new Object[] {};
    }
}
