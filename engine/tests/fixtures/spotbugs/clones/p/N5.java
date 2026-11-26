package p;
public class N5 {
    protected static class P implements Cloneable {
        public P clone() { return new P(); }
    }
    public enum E implements Cloneable { A }
    public static class Q implements Cloneable {
        int a;
    }
    public abstract static class R implements Cloneable {
        int a;
    }
    public static class S implements Cloneable {
        public S clone() { return null; }
    }
    public static class T implements Cloneable {
        public T clone() {
            if (this == null) { throw new IllegalStateException(); }
            throw new UnsupportedOperationException();
        }
    }
}
