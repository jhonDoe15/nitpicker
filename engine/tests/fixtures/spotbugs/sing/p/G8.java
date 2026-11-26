package p;
public class G8 {
    private static final G8 DEFAULT = new G8();
    public G8() {}
    public static void make() { System.out.println(new G8()); }
    public static G8 dflt() { return DEFAULT; }
}
