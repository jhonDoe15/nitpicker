package uc;

public class U1 {
    int f;
    boolean flag;
    static int sf;
    long lf;

    static void a() {}

    void eqKnown(int x) {
        if (x != 3) return;
        if (x == 4) a();
    }

    void rangeIn(int x) {
        if (x > 5) {
            if (x > 3) a();
        }
    }

    void rangeOut(int x) {
        if (x > 5) {
            if (x < 3) a();
        }
    }

    void retNeg(int x) {
        if (x < 0) return;
        if (x >= 0) a();
    }

    void longs(long x) {
        if (x < 0) return;
        if (x >= 0) a();
    }

    void shorts(short x) {
        if (x < 0) return;
        if (x >= 0) a();
    }

    void bytes(byte x) {
        if (x < 0) return;
        if (x >= 0) a();
    }

    void chars(char x) {
        if (x < 'a') return;
        if (x >= 'a') a();
    }

    void bools(boolean b) {
        if (!b) return;
        if (b) a();
    }

    void fieldBool() {
        if (flag) throw new IllegalStateException();
        if (flag) a();
    }

    void fieldBoolCall() {
        if (flag) throw new IllegalStateException();
        a();
        if (flag) a();
    }

    void fieldInt() {
        if (f < 0) return;
        if (f >= 0) a();
    }

    void staticField() {
        if (sf < 0) return;
        if (sf >= 0) a();
    }

    void otherField(U1 o) {
        if (o.f < 0) return;
        if (o.f >= 0) a();
    }

    void arrayLen(String[] p) {
        if (p.length != 3) return;
        if (p.length == 4) a();
    }

    void twoVars(int x, int y) {
        if (x > y) {
            if (x > y) a();
        }
    }

    void inAnd(int x) {
        if (x > 5 && x > 3) a();
    }

    void ternary(int x) {
        if (x > 5) {
            int y = x > 3 ? 1 : 2;
            if (y == 1) a();
        }
    }

    void whileLoop(int x) {
        while (x > 0) {
            if (x > 0) a();
            x--;
        }
    }

    void modified(int x) {
        if (x < 0) return;
        x = x - 10;
        if (x >= 0) a();
    }

    void leftConst(int x) {
        if (5 < x) {
            if (3 < x) a();
        }
    }

    static final int K = 5;

    void namedConst(int x) {
        if (x > K) {
            if (x > 3) a();
        }
    }

    void sameTest(int x) {
        if (x == 3) a();
        if (x == 3) a();
    }

    void elseBranch(int x) {
        if (x > 5) {
            a();
        } else if (x > 7) {
            a();
        }
    }

    void localAssign(int y) {
        int x = 3;
        if (x == 3) a();
    }

    void assertIt(long total) {
        assert total >= 0 : "neg " + total;
        if (total < 0) {
            total = 0;
        }
        lf = total;
    }

    void bothSides(int x) {
        if (x >= 0 && x <= 10) {
            if (x > 20) a();
        }
    }

    void neq(int x) {
        if (x == 0) return;
        if (x != 0) a();
    }

    void strict(int x) {
        if (x >= 5) {
            if (x > 4) a();
        }
    }
}
