package p;

public class U {
    static final boolean DEBUG = false;
    static boolean flag;
    boolean c, d;
    int x;

    void u1() {
        if (c) {
        }
    }

    void u2() {
        if (c);
    }

    void u3() {
        if (c) {
        } else {
        }
    }

    void u4(int[] a) {
        for (int i : a) {
            if (i > 0) break; else break;
        }
    }

    void u5() {
        if (c || d) {
        }
    }

    void u6() {
        if (c) {
            int y = 1;
        }
    }

    void u7() {
        if (c);
        x++;
    }

    void u7b() {
        if (c) {
        }
        x++;
    }

    void u7c() {
        if (c) {}
        x++;
    }

    void u9() {
        while (c) {
        }
    }

    void u11() {
        if (c) {
        } else {
            x++;
        }
    }

    void u12() {
        if (c) {
            if (d) {
            }
        }
    }

    void u13(int n) {
        for (int i = 0; i < n; i++) {
            if (c) {
            }
        }
    }

    void u14(int n) {
        for (int i = 0; i < n; i++) {
            x++;
            if (c) {
                continue;
            }
        }
    }

    void u15() {
        if (c) return;
        return;
    }

    boolean foo() { return c; }

    void u17() {
        if (foo()) {
        }
    }

    void u18() {
        if (c) {
            x++;
        } else if (d) {
        }
    }

    void u20() {
        if (DEBUG) {
        }
    }

    void u22() {
        if (c) { ; }
        x++;
    }

    void u23() {
        if (flag) {
        }
    }

    void u24() {
        if (x > 3) {
        }
    }

    void u25() {
        if (c && d) {
        }
    }

    void u26() {
        if (c) {
        }
        if (d) {
        }
    }

    void u27() { if (c) {} x++; }

    void u28() {
        if (c)
            ;
        x++;
    }

    void u29(Object o) {
        if (o instanceof String) {
        }
    }

    void u30(Object o) {
        if (o == null) {
        }
    }

    void u31() {
        if (!c) {
        }
    }
}
