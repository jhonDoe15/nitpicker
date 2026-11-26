package p;
public class A {
    public static int s;
    public static int t;
    public static int u;
    A() {
        this(
            s);
    }
    A(int x) { }
    void m() { s = 1; }
    @SuppressWarnings("x" + 1) void k() { }
}
