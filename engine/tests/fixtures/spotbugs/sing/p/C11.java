package p;
public class C11 {
    private static final C11 INSTANCE = new C11();
    public C11() {}
    public static C11 getInstance() { return INSTANCE; }
    public static C11 other() { return new C11() {}; }
}
