package p;
public class Q22 {
    private static final Q22 I = new Q22();
    public static Q22 get() { return I; }
    protected Q22 clone() throws CloneNotSupportedException { throw new CloneNotSupportedException(); }
}
