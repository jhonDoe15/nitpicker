package p;
public class Q3 {
    private static final Q3 I = new Q3();
    public static Q3 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { Object o = null; throw new CloneNotSupportedException(); }
}
