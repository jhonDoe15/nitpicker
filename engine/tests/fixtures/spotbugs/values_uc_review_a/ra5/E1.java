package ra5;
public class E1 {
    int f; E1 other; Integer bx; static int sf;
    int a1(int x, int y) {
        if (x > 3 && y > 3) {
            if (x > 2) return 1;
            if (y > 2) return 2;
        }
        return 0;
    }
    int a8(int x, int y) {
        if (x > 3) {
            if (y > 3) {
                if (x > 2) return 1;
                if (y > 2) return 2;
            }
        }
        return 0;
    }
    int a9(int x, int y) {
        if (x > 3 && y > 3) {
            if (y > 2) return 2;
            if (x > 2) return 1;
        }
        return 0;
    }
    int inner() {
        if (f > 3) {
            Runnable r = new Runnable() { public void run() { if (f > 2) sf++; } };
            r.run();
        }
        return 0;
    }
    class In { int g() { if (f > 3) { if (f > 2) return 1; } return 0; } }
    int fieldOther(E1 o) {
        if (f > 3) { o.f = 0; if (f > 2) return 1; }
        return 0;
    }
    int callOther(E1 o) {
        if (f > 3) { o.bar(); if (f > 2) return 1; }
        return 0;
    }
    void bar() { f = 1; }
    int bx1() { if (bx > 3) { if (bx > 2) return 1; } return 0; }
    int bx2() { if (bx.intValue() > 3) { if (bx > 2) return 1; } return 0; }
    int whl(int x) {
        while (true) { if (x > 5) break; x++; }
        if (x > 4) return 1;
        return 0;
    }
    int whl2(int x) {
        for (;;) { if (x > 5) { break; } if (x > 6) return 2; x++; }
        return 0;
    }
    int cond(boolean b, int x) {
        if (b) { if (x > 3) x = 0; }
        if (x > 3) { if (b) return 1; }
        if (b) { if (b) return 3; }
        return 0;
    }
    int nest(int x) {
        return x > 3 ? (x > 5 ? (x > 4 ? 1 : 2) : 3) : 4;
    }
    int lng(long l, int i) {
        if (l > 3000000000L) { if (l > 2000000000L) return 1; }
        long m = i;
        if (m > 5) { if (m > 3) return 2; }
        return 0;
    }
    int ch(char c) {
        if (c == 'a') { if (c == 'a') return 1; if (c < 'b') return 2; }
        if (c > '\n') { if (c > 5) return 3; }
        return 0;
    }
    int strlen(String s) {
        if (s.length() > 3) { if (s.length() > 2) return 1; }
        return 0;
    }
    int arr(int[] a) {
        if (a.length > 3) { if (a.length > 2) return 1; }
        return 0;
    }
    int sync(int x) {
        if (f > 3) { synchronized (this) { if (f > 2) return 1; } }
        return 0;
    }
}
