package p;
public class G5 {
    private static final G5 DEFAULT = new G5();
    public G5() {}
    public static G5 make() { return new G5(); }
    public static G5 getInstance() { return DEFAULT; }
}
