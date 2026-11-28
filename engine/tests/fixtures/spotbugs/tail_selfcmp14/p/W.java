package p;

public class W {
    int f; int g; long l;
    boolean c1(int v, int w) {
        boolean b = v == v;
        boolean c = w == w;
        return b && c;
    }
    boolean c2(int v) {
        boolean b = v == v;
        boolean c = v == v;
        return b && c;
    }
    boolean c3() {
        boolean b = f == f;
        boolean c = f == f;
        return b && c;
    }
    boolean c4() {
        boolean b = f == f;
        boolean c = g == g;
        return b && c;
    }
    int c5(int v) {
        int a = v - v;
        int b = v ^ v;
        return a + b;
    }
    boolean c6(int v) {
        boolean b = v == v;
        int a = v - v;
        return b;
    }
    boolean c7(long v) { return (long) v == (long) v; }
    boolean c8(int v) { return (long) v == (long) v; }
    long c9() { return (long) f - (long) f; }
    boolean c10(int v) { return (long) v == v; }
    boolean c11(Integer v) { return v == v.intValue(); }
    boolean c12(int v) { Integer w = v; return w == w; }
    boolean c13(short v) { return v == v; }
    boolean c14(int v) { return (short) v == (short) v; }
    boolean c15(Object v) { return (String) v == (String) v; }
    boolean c16(String v) {
        boolean a = v.equals(v);
        boolean b = v.equals(v);
        return a && b;
    }
}
