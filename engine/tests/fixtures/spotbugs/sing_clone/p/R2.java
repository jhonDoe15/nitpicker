package p;
public class R2 implements Cloneable {
    private static final R2 I = new R2();
    public static R2 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { throw new CloneNotSupportedException(); }
}
