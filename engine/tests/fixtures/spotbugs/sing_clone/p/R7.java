package p;
public class R7 implements Cloneable {
    private static final R7 I = new R7();
    public static R7 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { return I; }
    int z;
}
