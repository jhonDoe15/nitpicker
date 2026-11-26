package p;
public class Q24 {
    private static final Q24 I = new Q24();
    public static Q24 get() { return I; }
    @Deprecated protected Object clone() throws CloneNotSupportedException { return super.clone(); }
}
