package pk;
public class W2 {
    private Object f; private int g; private Object f2; private int g2;
    void set(Object o, int v) { f = o; g = v; f2 = o; g2 = v; }
    Object a(Object o) { if (o instanceof String f) { return null; } return null; }
    int b(Object o) { return switch (o) { case Integer g -> 0; default -> 0; }; }
    Object a2(Object o) { if (o instanceof String f2) { return f2; } return null; }
    int b2(Object o) { return switch (o) { case Integer g2 -> g2; default -> 0; }; }
}
