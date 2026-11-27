package p;

public class C {
    double a, b, c, e;
    final double fa = 1.5;
    boolean two(C o) { return a == o.a && b == o.b; }
    boolean three(C o) { return a == o.a && b == o.b && c == o.c; }
    boolean four(C o) { return a == o.a && b == o.b && c == o.c && e == o.e; }
    boolean threeOr(C o) { return a == o.a || b == o.b || c == o.c; }
    boolean threeSep(C o) { boolean x = a == o.a; boolean y = b == o.b; boolean z = c == o.c; return x && y && z; }
    boolean threeParams(double x, double y, double z, double w) { return x == y && y == z && z == w; }
    boolean threeConst(double x, double y, double z) { return x == 1.5 && y == 1.5 && z == 1.5; }
    boolean threeIf(C o) { if (a == o.a) return true; if (b == o.b) return true; if (c == o.c) return true; return false; }
    boolean fin(C o) { return fa == o.fa; }
    boolean fin2() { return fa == a; }
}
