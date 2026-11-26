package p;
public class C5 {
    private static final C5 DEFAULT = new C5();
    public C5() {}
    static C5 make() { return new C5(); }
    public static C5 dflt() { return DEFAULT; }
}
