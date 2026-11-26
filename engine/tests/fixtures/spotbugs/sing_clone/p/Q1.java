package p;
public class Q1 {
    private static final Q1 I = new Q1();
    public static Q1 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { throw new CloneNotSupportedException("msg"); }
}
