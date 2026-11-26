package p;
public class Q28 {
    private static final Q28 I = new Q28();
    public static Q28 get() { return I; }
    public strictfp Object clone() { return I; }
}
