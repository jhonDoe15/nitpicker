package p;

public class I {
    int f; int g;
    void m1(int a, int b) {
        f = a;
        f = b;
    }
    void m2(int a, int b) { f = a;
        f = b; }
    void m3(int a, int b) {
        f = a; f = b;
    }
    void m4(int a) {
        f = a;

        f = a;
    }
}
class I6 {
    int f = 4;
    I6(int a) { f = a; }
}
class I7 {
    int f
        = 4;
    I7(int a) { f = a; }
}
class I8 {
    int f = 4; I8(int a) { f = a; }
    I8(String a) { f = 2; }
}
class I3 {
    int f = 4;
    I3(int a) { f = a; }
    I3(int a, int b) { f = a; }
}
class I5 {
    int f = 4; Object o = new Object();
    I5(int a) { f = a; }
    I5(int a, int b) { super(); f = a; }
    I5(String a) { this(1); f = 3; }
}
class I12 {
    int x;
    void a() { x = (x = 3) + 1; }
    void b() { x++; x = 3; }
    void c() { int v = x++; x = v; }
    void d() { int v = x; x++; x = v; }
}
