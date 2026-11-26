package p;
public class S4 implements Cloneable {
    private static final S4 I = new S4();
    public static S4 get() { return I; }
    protected Object clone() { throw new UnsupportedOperationException(); }
}
