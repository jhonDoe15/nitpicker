package ra1;
public class A1 {
    int f; boolean b; Integer boxed; short s; char c; byte by;
    int loop1(int x) {
        for (int i = 0; i < 10; i++) {
            if (x > 5) { if (x > 3) return 1; }
        }
        return 0;
    }
    int loop2(int x) {
        while (x < 100) { x++; if (x < 100) f++; }
        return x;
    }
    int loop3(int x) {
        do { if (x == 3) break; x--; } while (x > 0);
        if (x == 3) return 1;
        return 2;
    }
    int lab(int x) {
        outer:
        for (int i = 0; i < 5; i++) {
            for (int j = 0; j < 5; j++) {
                if (x > 4) continue outer;
                if (x > 2) break outer;
                if (x > 4) return 9;
            }
        }
        return 0;
    }
    int sw(int x) {
        switch (x) {
            case 1: if (x == 1) return 1; break;
            case 2: if (x == 1) return 2;
            case 3: if (x == 3) return 3; break;
            default: if (x == 5) return 5;
        }
        return 0;
    }
    int sw2(int x) {
        return switch (x) { case 1 -> { if (x > 0) yield 1; yield 2; } case 2 -> 3; default -> { if (x == 1) yield 3; yield 4;} };
    }
    int tr(int x) {
        try { if (x > 3) { f++; } } catch (RuntimeException e) { if (x > 3) return 1; } finally { if (x > 3) f = 2; }
        return 0;
    }
    int tr2(int x) {
        if (x > 3) {
            try { foo(); } finally { if (x > 2) return 1; }
        }
        return 0;
    }
    void foo() {}
    int tern(int x) {
        int r = x > 3 ? (x > 2 ? 1 : 2) : (x < 3 ? 3 : 4);
        return r;
    }
    int andor(int x, int y) {
        if (x > 3 && y > 3) { if (x > 2) return 1; if (y > 2) return 2; }
        if (x > 3 || y > 3) { if (x > 2) return 1; }
        else { if (x > 3) return 5; }
        if (!(x > 5)) { if (x > 5) return 6; }
        return 0;
    }
    int comp(int x) {
        if (x > 3) { x += 1; if (x > 3) return 1; }
        if (x == 3) { x++; if (x == 3) return 2; }
        if (x++ > 3) { if (x > 3) return 3; }
        if (++x > 3) { if (x > 3) return 4; }
        return 0;
    }
    int alias() {
        int v = f;
        if (v > 3) { if (f > 3) return 1; f = 0; if (v > 3) return 2; }
        return 0;
    }
    int boxedT(Integer i) {
        if (i > 3) { if (i > 2) return 1; }
        if (boxed > 3) { if (boxed > 2) return 1; }
        return 0;
    }
    int edge(short sh, char ch, byte bt) {
        if (sh > 32767) return 1;
        if (sh < -32768) return 2;
        if (ch >= 0) return 3;
        if (ch > 65535) return 4;
        if (ch < 65536) return 5;
        if (bt > 127) return 6;
        if (bt < -128) return 7;
        if (sh == 40000) return 8;
        if (ch == -1) return 9;
        if (ch <= 65535) return 10;
        return 0;
    }
    int lng(long l) {
        if (l > 5000000000L) { if (l > 4000000000L) return 1; }
        if (l == 3) { if (l == 3) return 2; }
        return 0;
    }
}
