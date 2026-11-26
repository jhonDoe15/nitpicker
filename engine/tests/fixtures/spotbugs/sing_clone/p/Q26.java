package p;
public class Q26 {
    private static final Q26 I = new Q26();
    public static Q26 get() { return I; }
    public Object clone() { return I; }
 public Object clone(Object... a) { return I; }
}
