package p;
public class H1 {
    String s;
    Object o;
    int h;
    class In {}
    static class St {}
    H1(int t) {
        priv(); System.out.println(s);
    }
    void init() {}
    private void priv() {}
    final void fin() {}
    static void stat() {}
    static void stat(Object x) {}
}
