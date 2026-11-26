package p;
public class Q4 implements Cloneable {
    private static final Q4 I = new Q4();
    public static Q4 get() { return I; }
    public Q4 clone() { try { return (Q4) super.clone(); } catch (CloneNotSupportedException e) { return null; } }
}
