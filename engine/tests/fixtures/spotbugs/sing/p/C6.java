package p;
public class C6 {
    private static final C6 INSTANCE = create();
    public C6() {}
    private static C6 create() { return new C6(); }
    public static C6 getInstance() { return INSTANCE; }
}
