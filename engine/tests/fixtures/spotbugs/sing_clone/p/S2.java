package p;
public class S2 implements IC {
    private static final S2 I = new S2();
    public static S2 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { throw new CloneNotSupportedException(); }
}
