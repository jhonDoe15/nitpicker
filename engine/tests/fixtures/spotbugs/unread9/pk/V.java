package pk;

public class V {
    private Object a;
    private Object b;
    private int c;
    private int d;
    private Object e;
    private Object f;
    private int g;

    Object ra(Object x) { return (a = x); }
    void rb(Object x) { Object y = b = x; System.out.println(y); }
    int rc(int x) { return c = x; }
    void rd(int x) { System.out.println(d = x); }
    void re(Object x) { if ((e = x) != null) { System.out.println(); } }
    void rf(Object x) { f = x; }
    void rg(int x) { int y; y = g = x; }
}
