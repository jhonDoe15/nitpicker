package r;
public class L {
    static void use2(Object a, Object b) {}
    static Object s() { return ""; }
    void a(Object x) { if (x == null) {
        use2("a",
            x); } }
    void b(Object x) { if (x == null) {
        use2(s(),
            x); } }
    void c(Object x) { if (x == null) {
        use2("a"
            + s(), x); } }
    void d(Object x) { if (x == null) {
        String m = "a" +
            x; use2(m, m); } }
    void e(Object x) { if (x == null) {
        use2(
            s(),
            x); } }
    void f(Object x) { if (x == null) {
        use2(new Object(),
            x); } }
    void g(Object x) { if (x == null) {
        use2(
            new StringBuilder()
                .append(1),
            x); } }
    void h(Object x) { if (x == null) {
        Object y = s();
        use2(y,
            x); } }
}
