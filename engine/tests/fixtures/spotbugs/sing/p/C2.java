package p;
public class C2 {
    private static final C2 DEFAULT = new C2();
    public C2() {}
    public static C2 make() { C2 made = new C2(); return made; }
    public static C2 dflt() { return DEFAULT; }
}
