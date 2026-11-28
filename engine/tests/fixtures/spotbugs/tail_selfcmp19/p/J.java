package p;

public class J {
    int f; int never; static int s; static int snever; java.util.List<String> list;
    void wf() { f = 1; }
    static void sw() { s = 1; }
    static void spure() { }
    static int sret() { return 1; }
    static void sprint() { System.out.println(); }
    void print() { System.out.println(); }
    void stub() { }
    boolean d1() { int x = f; int y = f; new K1(); return x == y; }
    boolean d2() { int x = f; int y = f; new K2(this); return x == y; }
    boolean d3() { int x = f; int y = f; Object z = new java.util.ArrayList<>(list); return x == y; }
    boolean d5() { int x = never; int y = never; spure(); return x == y; }
    boolean d6() { int x = never; int y = never; System.gc(); return x == y; }
    boolean d7() { int x = never; int y = never; sprint(); return x == y; }
    boolean d8() { int x = never; int y = never; print(); return x == y; }
    boolean d9() { int x = never; int y = never; sw(); return x == y; }
    boolean d10() { int x = never; int y = never; sret(); return x == y; }
    boolean d11() { int x = snever; int y = snever; spure(); return x == y; }
    boolean d12() { int x = never; int y = never; Math.abs(1); return x == y; }
    boolean d13() { int x = never; int y = never; new K1(); return x == y; }
    boolean d14() { int x = f; int y = f; new K3(); return x == y; }
    boolean d15() { int x = never; int y = never; Thread.yield(); return x == y; }
    boolean d16() { int x = never; int y = never; list.add("a"); return x == y; }
    boolean d17() { int x = f; int y = f; sret(); return x == y; }
    boolean d18() { int x = f; int y = f; new StringBuilder().append(1); return x == y; }
    boolean d19() { int x = never; int y = never; stub(); return x == y; }
}
class K1 { K1() { J.s = 1; } }
class K2 { K2(J p) { p.f = 2; } }
class K3 { K3() { System.out.println(); } }
