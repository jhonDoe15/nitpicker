package ra4;
public class D1 {
    int a1(int x, int y) { if (x > 3 && y > 3) { if (x > 2) return 1; if (y > 2) return 2; } return 0; }
    int a2(int x, int y) { if (x > 3 && y > 3) { if (x > 2) f(); if (y > 2) return 2; } return 0; }
    int a3(int x, int y) { if (x > 3 && y > 3) { if (y > 2) return 2; if (x > 2) return 1; } return 0; }
    int a4(int x, int y) { if (x > 3 && y > 3) { if (y > 2) return 2; } return 0; }
    int a5(int x, int y) { if (x > 3) { if (y > 3) { if (x > 2) return 1; if (y > 2) return 2; } } return 0; }
    int a6(int x, int y) { if (x > 3 && y > 3) { f(); if (x > 2) return 1; f(); if (y > 2) return 2; } return 0; }
    int a7(int x, int y) { if (x > 3 && y > 3) { if (x > 2) return 1; else return 3; } return 0; }
    int b1(int x) { if (x > 3) return 1; if (!(x > 5)) { if (x > 5) return 6; } return 0; }
    int b2(int x) { if (x > 3) f(); if (!(x > 5)) { if (x > 5) return 6; } return 0; }
    int b3(int x) { if (x > 3) return 1; if (x <= 5) { if (x > 5) return 6; } return 0; }
    int b4(int x) { if (x < 3) return 1; if (x <= 5) { if (x > 5) return 6; } return 0; }
    int b5(int x) { if (x > 3) return 1; if (x < 5) { if (x > 5) return 6; } return 0; }
    int b6(int x) { if (x > 3) return 1; if (x < 5) { if (x < 5) return 6; } return 0; }
    int b7(int x) { if (x == 3) return 1; if (x < 5) { if (x == 3) return 6; } return 0; }
    void f() {}
}
