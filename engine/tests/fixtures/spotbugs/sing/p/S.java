package p;
public class S {
    private static final S INSTANCE = new S();
    public S() {}
    public S(int x) {}
    public static S getInstance() { return INSTANCE; }
}
