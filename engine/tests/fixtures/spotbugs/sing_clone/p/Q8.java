package p;
public class Q8 {
    private static final Q8 I = new Q8();
    public static Q8 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { throw (new CloneNotSupportedException()); }
}
