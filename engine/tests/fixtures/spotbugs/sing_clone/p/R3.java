package p;
public class R3 implements Cloneable {
    private static final R3 I = new R3();
    public static R3 get() { return I; }
    public R3 clone() { return null; }
}
