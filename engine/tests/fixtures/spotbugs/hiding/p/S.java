package p;
public class S extends A {
    public static synchronized void f() {
        System.gc();
    }
    @Deprecated
    protected static int g(int x) {
        throw new UnsupportedOperationException();
    }
}
