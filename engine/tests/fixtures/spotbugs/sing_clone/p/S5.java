package p;
public class S5 implements Cloneable {
    private static final S5 I = new S5();
    public static S5 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { Object o = null; throw new CloneNotSupportedException(); }
}
