package p;

public class H {
    int never; int ctorOnly; int other; int self; int viaO; int initd = 3; static int snever; static int sinit; static int sclinit = 4;
    H o;
    static { sinit = 2; }
    H() { ctorOnly = 1; }
    void stub() { }
    void later() { self = 1; }
    boolean c1() { int x = never; int y = never; stub(); return x == y; }
    boolean c2() { int x = ctorOnly; int y = ctorOnly; stub(); return x == y; }
    boolean c3() { int x = other; int y = other; stub(); return x == y; }
    boolean c4() { int x = self; int y = self; stub(); return x == y; }
    boolean c5() { int x = viaO; int y = viaO; stub(); return x == y; }
    boolean c6() { int x = initd; int y = initd; stub(); return x == y; }
    boolean c7() { int x = snever; int y = snever; stub(); return x == y; }
    boolean c8() { int x = sinit; int y = sinit; stub(); return x == y; }
    boolean c9() { int x = sclinit; int y = sclinit; stub(); return x == y; }
    void w() { o.viaO = 2; }
    boolean c10() { int x = never; int y = never; System.out.println(); return x == y; }
    boolean c11(String v) { String x = v; stub(); return x.equals(x); }
    boolean c12(H h) { int x = h.never; int y = h.never; stub(); return x == y; }
}
class H2 {
    void w(H h) { h.other = 1; }
}
