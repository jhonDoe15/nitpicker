package p;
public class S6 implements Cloneable {
    private static final S6 I = new S6();
    public static S6 get() { return I; }
    protected S6 clone() throws CloneNotSupportedException { throw new CloneNotSupportedException(); }
}
