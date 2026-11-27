package ra2;
public class B1 {
    Integer boxed; byte fb; short fs;
    int a(int x, int y) { if (x > 3 && y > 3) { if (y > 2) return 2; } return 0; }
    int a2(int x, int y) { if (x > 3 && y > 3) { if (x > 2) return 1; } return 0; }
    int b(int x) { if (!(x > 5)) { if (x > 5) return 6; } return 0; }
    int b2(int x) { if (x > 5) return 1; if (x > 5) return 6; return 0; }
    int b3(int x) { if (!(x < 5)) { if (x < 5) return 6; } return 0; }
    int c() { if (boxed > 3) { if (boxed > 2) return 1; } return 0; }
    int c2(Integer i) { if (i > 3) { if (i > 2) return 1; } return 0; }
    int d(byte bt) { if (bt < -128) return 7; return 0; }
    int d2(byte bt) { if (bt > 127) return 7; return 0; }
    int d3(byte bt) { if (bt >= -128) return 7; return 0; }
    int d4(byte bt) { if (bt <= 127) return 7; return 0; }
    int e(short sh) { if (sh == 40000) return 8; return 0; }
    int e2(short sh) { if (sh != 40000) return 8; return 0; }
    int e3(char ch) { if (ch == 70000) return 8; return 0; }
    int e4(byte b) { if (b == 200) return 8; return 0; }
    int e5(byte b) { if (b == -200) return 8; return 0; }
    int f(int x) { try { foo(); } finally { if (x > 2) return 1; } return 0; }
    int g(int x) { if (x > 3) { try { foo(); } finally { if (x > 2) return 1; } } return 0; }
    int g2(int x) { if (x > 3) { try { foo(); } finally { if (x > 2) f2(); } } return 0; }
    void f2() {}
    void foo() {}
}
