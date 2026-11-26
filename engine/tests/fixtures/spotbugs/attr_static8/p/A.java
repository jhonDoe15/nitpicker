package p;
public class A {
    public static int g1;
    public static int g2;
    public static int g3;
    public static int g4;
    static { g1 = 1; int q = g1; }
    static { int q = g2; g2 = 1; }
    static { g4 = 1; }
    static { int a = g4; }
    int m() { return g1 + g2 + g3 + g4; }
}
