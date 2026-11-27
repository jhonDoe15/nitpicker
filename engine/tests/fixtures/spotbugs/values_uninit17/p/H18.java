package p;
public class H18 {
    String s;
    Object o;
    int h;
    class In {}
    static class St {}
    H18(int t) {
        synchronized (this) { } System.out.println(s);
    }
    void init() {}
    private void priv() {}
    final void fin() {}
    static void stat() {}
    static void stat(Object x) {}
}
