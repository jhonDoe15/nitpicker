package p;
public class A {
    private final int a = 1;
    final String b = "x";
    public final long c = 2L;
    protected final boolean d = true;
    private final char e = 'c';
    private final double f = 1.5;
    private final int g;
    private final Integer h = 1;
    private final String i = "a" + "b";
    private final int j = 1 + 2;
    private final int k = Integer.MAX_VALUE;
    private final String l = null;
    private final int unread = 7;
    private final transient int tr = 3;
    private final int big = 123456;
    private final String empty = "";
    A() { g = 1; }
    int r() { return a + g + e + (int) f + h + j + k + big + tr; }
    String s() { return b + c + d + i + l + empty; }
    class In { private final int x = 1; int r() { return x; } }
    static class Ne { private final int y = 1; int r() { return y; } }
    void an() { new Object() { private final int z = 1; int r() { return z; } }; }
    enum E { X; private final int v = 1; int r() { return v; } }
}
