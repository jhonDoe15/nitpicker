package p;
public class C14 {
    private static final C14 INSTANCE = new C14();
    public C14() {}
    public static C14 getInstance() { return INSTANCE; }
    public static C14 copy(C14 other) { return new C14(); }
}
