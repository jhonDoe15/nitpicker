package p;
public class Q2 {
    private static final Q2 I = new Q2();
    public static Q2 get() { return I; }
    protected Object clone() { throw new UnsupportedOperationException(); }
}
