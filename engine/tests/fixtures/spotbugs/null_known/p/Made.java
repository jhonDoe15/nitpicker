package p;
public class Made {
    static Object make() { return new Object(); }
    Object inst() { return "x"; }
    Object maybe() { return Math.random() > 0.5 ? null : "x"; }
    static int use(String s) { return s.length(); }
}
