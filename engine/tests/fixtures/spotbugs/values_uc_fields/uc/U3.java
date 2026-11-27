package uc;

public class U3 {
    int f;
    int g;
    static int sf;
    U3 next;

    static void a() {}
    static void b() {}
    static int c1() { return 1; }
    static int c2() { return 2; }
    void inst() {}
    static void other() { Helper.run(); }

    void q1(int x) {
        if (x > 5) {
            if (x > 5) a();
        }
    }

    void q2(int x) {
        if (x < 0) return;
        if (x >= -3) a();
    }

    void q3(int x) {
        if (x < 0) return;
        if (x > -1) a();
    }

    void q4a(int x) {
        if (x > 5) {
            f = x > 3 ? 1 : 2;
        }
    }

    void q4b(int x) {
        if (x > 5) {
            f = x > 3 ? c1() : c2();
        }
    }

    void q4c(int x) {
        if (x > 5) {
            f = x > 3 ? x : 0;
        }
    }

    void q4d(int x) {
        if (x > 5) {
            f = x < 3 ? x : 0;
        }
    }

    void q5(int x) {
        while (x > 2) {
            if (x > 1) a();
            x--;
        }
    }

    void q6(int x) {
        if (x < 0) return;
        if (x >= 0) a();
        b();
    }

    void q7(int x) {
        if (x >= 2) {
            if (x >= 2) a();
        }
    }

    void q8(int x) {
        if (x < 0) {
            return;
        }
        if (x > -1) {
            a();
        }
    }

    void q9(int x) {
        if (x < 0) throw new IllegalArgumentException();
        if (x > -1) a();
    }

    void q10(int x) {
        if (x < 0) {
            a();
        } else {
            if (x > -1) b();
        }
    }

    void q11() {
        if (f < 0) return;
        Helper.run();
        if (f < 0) a();
    }

    void q12() {
        if (f < 0) return;
        g = 3;
        if (f < 0) a();
    }

    void q13() {
        if (f < 0) return;
        int t = next.f;
        if (f < 0) a();
    }

    void q14(U3 o) {
        if (o.f < 0) return;
        o.inst();
        if (o.f < 0) a();
    }

    void q15(U3 o) {
        if (o.f < 0) return;
        inst();
        if (o.f < 0) a();
    }

    void q16(U3 o) {
        if (o.f < 0) return;
        a();
        if (o.f < 0) a();
    }

    void q17() {
        if (next.f < 0) return;
        if (next.f < 0) a();
    }

    void q18() {
        if (sf < 0) {
            if (sf > 3) a();
        }
    }

    void q19(int x) {
        if (x > 5) {
            if (x > 3) {
                a();
            } else {
                b();
            }
        }
    }

    void q20(int x) {
        if (x > 5) {
            do { a(); } while (x > 3);
        }
    }
}

class Helper { static void run() {} }
