package p;
public class A {
    public int t;
    public static int s;
    public A() { t = 1; }
    void m() { t = 2; s = 2; }
    static { s = 1; }
}
