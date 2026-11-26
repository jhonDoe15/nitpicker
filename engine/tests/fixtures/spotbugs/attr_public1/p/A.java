package p;
public class A {
    public int a;
    public int b = 3;
    public static int c;
    public static int d = 4;
    public final int e = 5;
    public long f;
    public boolean g;
    public Integer h;
    public String i;
    public int j;
    protected int k;
    int l;
    public volatile int m;
    public transient int n;
    public char o;
    public int q;
    public A(int v) { a = v; }
    void set() { f = 1; g = true; h = 2; i = "x"; o = 'c'; this.q = 1; q = 2; k = 1; l = 1; m = 1; n = 1; }
    static void st() { c = 9; }
    int read() { return j; }
}
class B {
    public int x;
    void s() { x = 1; }
}
class C {
    void w(A a) { a.j = 5; }
}
