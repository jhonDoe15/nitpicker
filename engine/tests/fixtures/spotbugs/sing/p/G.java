package p;
public class G {
    private static final G DEFAULT = new G();
    public G() {}
    public static G make() { return new G(); }
    public static G dflt() { return DEFAULT; }
    int x;
}
