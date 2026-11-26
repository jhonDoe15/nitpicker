package p;
public class W {
    public static class Inner {
        private static final Inner INSTANCE = new Inner();
        public Inner() {}
        public static Inner getInstance() { return INSTANCE; }
    }
}
