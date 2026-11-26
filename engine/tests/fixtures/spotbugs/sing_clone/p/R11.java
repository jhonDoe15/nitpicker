package p;
public class R11 implements Cloneable {
    private static final R11 I = new R11();
    public static R11 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { return super.clone(); }
}
