package p;
public class C1 {
    private static final C1 DEFAULT = new C1();
    public C1() {}
    public static C1 make(boolean flag) {
        if (flag) {
            return new C1();
        }
        return DEFAULT;
    }
}
