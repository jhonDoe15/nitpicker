package uc;

public class U4 {
    int f;
    String s;

    static void a() {}
    static void w(U4 o) { o.f = -1; }
    static void callsInst(U4 o) { o.inst(); }
    void inst() {}
    static int pure(int v) { return v + 1; }

    void r1(int x) {
        if (x > -1) {
            if (x >= 0) a();
        }
    }

    void r2(int x) {
        if (x >= 2 && x <= 10) {
            if (x >= 2) a();
        }
    }

    void r3(int x) {
        if (x >= 0 && x <= 10) {
            if (x <= 10) a();
        }
    }

    void r4(int x) {
        if (x > 5) { f = x > 3 ? 1 : 0; }
    }

    void r5(int x) {
        if (x > 5) { f = x > 3 ? 5 : 7; }
    }

    void r6(int x) {
        if (x > 5) { s = x > 3 ? "a" : "b"; }
    }

    void r7(int x, int y, int z) {
        if (x > 5) { f = x > 3 ? y : z; }
    }

    void r8(int x) {
        if (x > 5) { f = x < 3 ? 1 : 2; }
    }

    void r9(int x) {
        if (x > 5) { boolean t = x > 3; f = t ? 1 : 0; }
    }

    void s1() {
        if (f < 0) return;
        w(this);
        if (f < 0) a();
    }

    void s2() {
        if (f < 0) return;
        callsInst(this);
        if (f < 0) a();
    }

    void s3() {
        if (f < 0) return;
        int t = Math.abs(f);
        if (f < 0) a();
    }

    void s4() {
        if (f < 0) return;
        H2.run();
        if (f < 0) a();
    }

    void s5() {
        if (f < 0) return;
        int t = pure(3);
        if (f < 0) a();
    }

    void s6() {
        if (f < 0) return;
        String t = String.valueOf(3);
        if (f < 0) a();
    }

    void s7() {
        if (f < 0) return;
        int t = s.length();
        if (f < 0) a();
    }

    void s8() {
        if (f < 0) return;
        Object t = new Object();
        if (f < 0) a();
    }

    void s9() {
        if (f < 0) return;
        H2.write();
        if (f < 0) a();
    }

    void s10() {
        if (f < 0) return;
        synchronized (this) { a(); }
        if (f < 0) a();
    }

    void s11(int[] arr) {
        if (f < 0) return;
        arr[0] = 3;
        if (f < 0) a();
    }

    void t1(int x) {
        if (x >= 2 && x <= 10) {
            if (x >= 2) a();
            if (x != 11) a();
        }
    }
}
