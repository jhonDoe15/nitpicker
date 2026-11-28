package p;
public class B4 {
    private static final B4 SINGLE = new B4();
    private static final C4 OTHER = new C4();
    private B4() {}
    public static B4 get() { return SINGLE; }
    public static C4 other() { return OTHER; }
}
