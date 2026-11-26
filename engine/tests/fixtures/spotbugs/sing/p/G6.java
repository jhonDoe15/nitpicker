package p;
public class G6 {
    private static final G6 DEFAULT = new G6();
    public G6() {}
    public static G6 make(int a) { return new G6(); }
    public static G6 dflt() { return DEFAULT; }
}
