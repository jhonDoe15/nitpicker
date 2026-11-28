package p;
public class Q6 {
    private static final Q6 I = new Q6();
    public static Q6 get() { return I; }
    protected Object clone() throws CloneNotSupportedException { if (I != null) throw new CloneNotSupportedException(); return null; }
}
