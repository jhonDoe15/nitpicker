package ra3;
public class C1 {
    int a(int x, int y) { if (x > 3 && y > 3) { if (x > 2) return 1; if (y > 2) return 2; } return 0; }
    int b(int x, int y) {
        if (x > 3 || y > 3) { if (x > 2) return 1; }
        else { if (x > 3) return 5; }
        if (!(x > 5)) { if (x > 5) return 6; }
        return 0;
    }
    int b2(int x) {
        if (x > 3 || x < 0) { if (x > 2) return 1; }
        if (!(x > 5)) { if (x > 5) return 6; }
        return 0;
    }
    int b3(int x, int y) {
        if (x > 3 || y > 3) { return 1; }
        if (!(x > 5)) { if (x > 5) return 6; }
        return 0;
    }
    int b4(int x) {
        if (x > 3) { return 1; }
        if (!(x > 5)) { if (x > 5) return 6; }
        return 0;
    }
    int e(short sh) {
        if (sh > 32767) return 1;
        if (sh == 40000) return 8;
        return 0;
    }
    int e2(short sh) {
        if (sh > 32767) return 1;
        if (sh < -32768) return 2;
        if (sh == 40000) return 8;
        return 0;
    }
    int e3(short sh) {
        if (sh < -32768) return 2;
        if (sh == 40000) return 8;
        return 0;
    }
    int e4(char ch) {
        if (ch > 65535) return 4;
        if (ch == 70000) return 8;
        return 0;
    }
    int e5(short sh) {
        if (sh > 32000) return 1;
        if (sh == 40000) return 8;
        return 0;
    }
}
