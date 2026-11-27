package uc;
public class X4 {
    static int sf;
    int f;
    static void a() {}
    void m() { if (f < 0) return; a(); if (f < 0) a(); }
    static void w() { sf = 1; }
}
