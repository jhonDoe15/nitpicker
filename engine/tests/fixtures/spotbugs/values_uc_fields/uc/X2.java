package uc;
public class X2 {
    int f;
    static void a() {}
    void m() { if (f < 0) return; a(); if (f < 0) a(); }
}
class X2w { void w(X2 o) { o.f = 3; } }
