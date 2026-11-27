package p;
public class V { int f, g;
    void d1(int a) { g = a; f = f; }
    void d2(int a) { f = f; g = a; }
    void d3(int a) { int x = f; f = x; }
    void d4(int a) { int x = f; f = x; g = a; }
    void d5(int a) { int x = f; g = a; f = x; }
    void d6(int c) { int x = f; switch (c) { case 1: g = 1; break; default: g = 2; } f = x; }
    void d7(int c) { int x = f; if (c > 0) g = 1; f = x; }
    void d8(int c) { int x = f; g = 1; f = x; }
    void d9(int c) { f = f; }
    void d10(int a, int bb) { f = f; g = bb; }
    void d11(int a, int bb) { f = f; g = a; }
    void d12(int a) { a = 3; f = f; }
    void d13(int a) { f = f; a = 3; }
    void d14(int a) { if (a > 0) f = f; }
}
