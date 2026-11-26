package p;
public class Made {
    static Object make() { return new Object(); }
    Object inst() { return "x"; }
    Object maybe() { return System.nanoTime() > 0 ? null : "x"; }
    static int use(String s) { return s.length(); }
}
