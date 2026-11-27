package uc;
public class X3 {
    int f;
    static void a() {}
    void m() { if (f < 0) return; a(); if (f < 0) a(); }
    void w() { this.f++; }
}
