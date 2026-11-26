package p;
public class Q20 implements Cloneable {
    private static final Q20 I = new Q20();
    public static Q20 get() { return I; }
    public Object clone() throws CloneNotSupportedException { return super.clone(); }
}
