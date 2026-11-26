package p;
public class G3 {
    private static final G3 INSTANCE = new G3();
    public G3() {}
    public static G3 dflt() { return INSTANCE; }
}
