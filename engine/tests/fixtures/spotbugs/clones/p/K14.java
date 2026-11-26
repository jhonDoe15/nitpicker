package p;
public class K14 {
    static class In implements Cloneable {
        @Override
        public In clone() {
            In x = new In();
            return x;
        }
    }
    private static class Pv implements Cloneable {
        public Pv clone() { return new Pv(); }
    }
    enum E implements Cloneable { A }
}
