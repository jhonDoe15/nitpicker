package p;
public class R12 implements IC {
    private static final R12 I = new R12();
    public static R12 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { return super.clone(); }
}
