package p;
public class G9 {
    private static final G9 DEFAULT = new G9();
    public G9() {}
    private static G9 make() { return new G9(); }
    public static G9 dflt() { return DEFAULT; }
}
