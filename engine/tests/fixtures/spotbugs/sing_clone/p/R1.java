package p;
public class R1 implements Cloneable {
    private static final R1 I = new R1();
    public static R1 get() { return I; }
    public Object clone() throws CloneNotSupportedException { return super.clone(); }
}
