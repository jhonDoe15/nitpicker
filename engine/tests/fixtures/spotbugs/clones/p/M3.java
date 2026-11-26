package p;
public class M3 {
    public static class In implements Cloneable {
        int a;
        @Override
        public In clone() {
            In copy = new In();
            copy.a = a;
            return copy;
        }
    }
}
