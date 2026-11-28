package p;
public class G7 {
    private static G7 last;
    private static final G7 DEFAULT = new G7();
    public G7() {}
    public static G7 make() { last = new G7(); return last; }
    public static G7 dflt() { return DEFAULT; }
}
