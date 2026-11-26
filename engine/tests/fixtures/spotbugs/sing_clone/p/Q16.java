package p;
public class Q16 {
    private static final Q16 I = new Q16();
    public static Q16 get() { return I; }
    protected Object clone(int a) { return null; }
 protected Object clone() throws CloneNotSupportedException { return super.clone(); }
}
