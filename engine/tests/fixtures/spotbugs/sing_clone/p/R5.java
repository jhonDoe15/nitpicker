package p;
public class R5 extends java.util.ArrayList<String> {
    private static final R5 I = new R5();
    public static R5 get() { return I; }
    public Object clone() { return super.clone(); }
}
