package uc;
public class K1 {
    int f; boolean flag; K1 next;
    static void a() {}
    void m() { if (f < 0) throw new IllegalStateException(); a(); if (f < 0) a(); }
}
