package p;
public class R8 implements Cloneable, java.io.Serializable {
    private static final R8 I = new R8();
    public static R8 get() { return I; }
    public Object clone() { return null; }
}
