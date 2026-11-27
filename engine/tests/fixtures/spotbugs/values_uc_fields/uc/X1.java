package uc;
public class X1 {
    int f;
    static void a() {}
    X1(int v) { f = v; }
    void m() { if (f < 0) return; a(); if (f < 0) a(); }
}
