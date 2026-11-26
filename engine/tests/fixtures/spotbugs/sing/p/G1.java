package p;
public class G1 {
    private static final G1 DEFAULT = new G1();
    public G1() {}
    public static G1 dflt() { return DEFAULT; }
    int x;
}
