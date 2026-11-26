package p;
public class K {
    public K() {}
    private static class Holder {
        static final K INSTANCE = new K();
    }
    public static K get() { return Holder.INSTANCE; }
}
