package p;
public class V {
    private static final V INSTANCE = new V();
    public V() {}
    public static V getInstance() {
        V found = INSTANCE;
        return found;
    }
}
