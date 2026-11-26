package p;
public class Q {
    private static final Q INSTANCE;
    static {
        INSTANCE = new Q();
    }
    public Q() {}
    public static Q getInstance() { return INSTANCE; }
}
