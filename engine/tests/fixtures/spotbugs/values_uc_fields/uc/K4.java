package uc;
public class K4 {
    int f; boolean flag; K4 next;
    static void a() {}
    void m() { if (flag) throw new IllegalStateException(); a(); if (flag) a(); }
}
