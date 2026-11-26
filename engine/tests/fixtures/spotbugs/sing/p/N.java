package p;
public class N {
    private static final N INSTANCE = new N();
    public N() {}
    public N self() { return INSTANCE; }
}
