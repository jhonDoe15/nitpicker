package p;
public class Q18 {
    private static final Q18 I = new Q18();
    public static Q18 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { CloneNotSupportedException e = new CloneNotSupportedException(); throw e; }
}
