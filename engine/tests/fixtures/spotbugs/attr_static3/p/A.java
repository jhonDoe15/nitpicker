package p;
public class A {
    public static int b1;
    public static int b2;
    public static int b3;
    public static int b4 = 1;
    public static int b5;
    public static int b6;
    public static Object b7;
    public static int b8;
    static {
        if (System.nanoTime() > 0) { b1 = 1; } else { b1 = 2; }
        b2 = 1;
        try { b3 = Integer.parseInt("1"); } catch (RuntimeException e) { b3 = 0; }
        b4 = 2;
        for (int i = 0; i < 3; i++) { b5 = i; }
        b6 = System.nanoTime() > 0 ? 1 : 2;
        try { b7 = Class.forName("x"); } catch (Exception e) { throw new RuntimeException(e); }
        b8 = 1; b8 = 2;
    }
    int r() { return b1 + b2 + b3 + b4 + b5 + b6 + b8 + (b7 == null ? 1 : 0); }
}
