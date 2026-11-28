package p;
public class Q10 {
    private static final Q10 I = new Q10();
    public static Q10 get() { return I; }
    public final Object clone() throws CloneNotSupportedException { throw new java.lang.CloneNotSupportedException(); }
}
