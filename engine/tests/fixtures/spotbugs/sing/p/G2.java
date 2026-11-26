package p;
public class G2 {
    private static final G2 DEFAULT = new G2();
    public G2() {}
    public static G2 make() { return new G2(); }
    public static G2 dflt() { return DEFAULT; }
}
