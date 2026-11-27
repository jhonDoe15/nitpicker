package uc;

public class U2 {
    int f;
    static int sf;
    U2 next;

    static void a() {}
    static void b() {}
    void inst() {}

    void p1(int x) {
        if (x > 5) {
            if (x > 3) a();
            b();
        }
    }

    void p2(int x) {
        if (x < 0) return;
        if (x < 0) a();
    }

    void p4(int x) {
        if (x > 5) {
            int y = x < 3 ? 1 : 2;
            f = y;
        }
    }

    void p6a() {
        if (f < 0) return;
        if (f < 0) a();
    }

    void p6b() {
        if (sf < 0) return;
        if (sf < 0) a();
    }

    void p6c(U2 o) {
        if (o.f < 0) return;
        if (o.f < 0) a();
    }

    void p6d() {
        if (f < 0) return;
        inst();
        if (f < 0) a();
    }

    void p6e() {
        if (f < 0) return;
        f = -3;
        if (f < 0) a();
    }

    void p6f() {
        if (f < 0) return;
        next.inst();
        if (f < 0) a();
    }

    void p7(long x) {
        if (x > 5) {
            if (x > 3) a();
        }
    }

    void p8(int x) {
        while (x > 0) {
            if (x <= 0) a();
            x--;
        }
    }

    void p10(int x) {
        if (x > 5) return;
        if (x > 7) a();
    }

    void p11(int x) {
        if (x > 5) {
            if (x > 3) a(); else b();
        }
    }

    void p12(int x) {
        if (x < 0 || x > 10) return;
        if (x == 11) a();
    }

    void p13(int x) {
        if (x > 5) {
            if (x != 3) a();
        }
    }

    void p14(int x) {
        if (x == 3) {
            if (x > 2) a();
        }
    }

    void p15(char c) {
        if (c > 'z') return;
        if (c > 'z') a();
    }

    void p16(boolean q) {
        if (q) {
            if (q) a();
        }
    }

    void p17(int x) {
        if (x > -5) {
            if (x < -7) a();
        }
    }

    void p18(byte v) {
        if (v > 200) a();
    }

    void p18b(char v) {
        if (v < 0) a();
    }

    void p18c(short v) {
        if (v >= 40000) a();
    }

    void p18d(int v) {
        if (v > Integer.MAX_VALUE) a();
    }

    int p20(int x) {
        if (x < 0) return 0;
        return x >= 0 ? x : -x;
    }

    void p21(int x) {
        if (x > 5) {
            if (x == 3) a();
        }
    }

    void p22(int x) {
        if (x > 5) {
            if (x <= 3) a();
        }
    }

    void p23(int x) {
        if (x != 0) {
            if (x == 0) a();
        }
    }

    void p24(int x) {
        if (x > 5) {
            a();
            if (x > 3) b();
        }
    }

    void p25(int x) {
        if (x > 5) {
            if (x > 3) {
                a();
            }
            a();
        }
    }

    void p26(int x) {
        if (x > 5) {
            for (int i = 0; i < 3; i++) {
                if (x < 3) a();
            }
        }
    }

    void p27(int x) {
        for (int i = 0; i < 3; i++) {
            if (i > 5) a();
        }
    }
}
