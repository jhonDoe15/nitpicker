package q;
public class O {
    static class X { String f; public String toString() { return f; } }
    interface I { String name(); }
    int a(Object o) { Object c = o.getClass(); if (c == null) { return 1; } return 0; }
    int b(X x) { String s = x.toString(); if (s == null) { return 1; } return 0; }
    int c(I i) { String s = i.toString(); if (s == null) { return 1; } return 0; }
    int d(StringBuilder sb) { String s = sb.toString(); if (s == null) { return 1; } return 0; }
    int e(Object o) { String s = String.valueOf(o); if (s == null) { return 1; } return 0; }
    int f(Thread t) { String s = t.toString(); if (s == null) { return 1; } return 0; }
    int g(java.util.List<String> l) { String s = l.toString(); if (s == null) { return 1; } return 0; }
}
