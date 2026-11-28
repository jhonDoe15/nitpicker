package uc;
public class V6 {
    int f; boolean flag; V6 next;
    static void a() {}
    void m() { if (f < 0) return; a(); if (f < 0) a(); }
    void w(int x) { f = x > 3 ? 1 : 2; }
}
