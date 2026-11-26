package p;
public class Q23 {
    private static final Q23 I = new Q23();
    public static Q23 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { throw new CloneNotSupportedException("a" + "b"); }
}
