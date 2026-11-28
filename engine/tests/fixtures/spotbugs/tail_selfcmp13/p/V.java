package p;

public class V {
    int f; final int fin = 1; final int fin2; static final int K = 5; final String fs = "a"; volatile int vol; int[] arr;
    V() { fin2 = 2; }
    void m() { }
    boolean c1() { return fin == fin; }
    boolean c2() { return fin2 == fin2; }
    boolean c3() { return K == K; }
    boolean c4() { return fs == fs; }
    boolean c5() { return vol == vol; }
    boolean c6() { int x = f; try { m(); } catch (RuntimeException e) { return x == f; } return false; }
    boolean c7(int v) { try { m(); } catch (RuntimeException e) { return v == v; } return false; }
    boolean c8(int v) { try { m(); } finally { boolean b = v == v; } return false; }
    boolean c9() { try { m(); } finally { boolean b = f == f; } return false; }
    boolean c10(int v) { Runnable r = new Runnable() { public void run() { boolean b = v == v; } }; return false; }
    boolean c11(int v) { Runnable r = () -> { boolean b = v == v; }; return false; }
    boolean c12() { return (long) f == (long) f; }
    boolean c13() { return arr == arr; }
    boolean c14() { return arr.length == arr.length; }
    boolean c15(int[] a) { return a.length == a.length; }
    boolean c16(int v) { int x; x = v; return x == v; }
    boolean c17(int v) { return v == v && v == v; }
    boolean c18(int v) { boolean b = v == v; boolean c = v == v; return b && c; }
    boolean c19(int v) { return v == v
        || v != v; }
    static boolean c20(int v) { return (v == v) == true; }
    boolean c21(Object v) { return v.equals(v) && v.equals(v); }
    boolean c22(int v) {
        return v
            ==
            v; }
    int c23(int v) {
        return v
            - v; }
    boolean c24(String v) {
        return v
            .equals(v); }
    boolean c25() {
        return f
            == f; }
    void c26(int v) { f = v;
        f = v + 1; }
    boolean c27(int v) { int x = v; boolean c = x == v; return c; }
}
