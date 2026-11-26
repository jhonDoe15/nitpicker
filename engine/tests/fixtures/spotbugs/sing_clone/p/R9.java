package p;
public class R9 implements Cloneable {
    private static final R9 I = new R9();
    public static R9 get() { return I; }
    protected Object clone(int x) { return null; }
}
