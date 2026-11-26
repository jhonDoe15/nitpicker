package p;
public class C5b {
    private static final C5b DEFAULT = new C5b();
    public C5b() {}
    protected static C5b make() { return new C5b(); }
    public static C5b dflt() { return DEFAULT; }
}
