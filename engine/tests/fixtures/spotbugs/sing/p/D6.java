package p;
class D6 {
    private static final D6 INSTANCE = new D6();
    static D6 getInstance() { return INSTANCE; }
    static class Inner {
        private static final Inner IN = new Inner();
        static Inner get() { return IN; }
    }
    private static class Hidden {
        private static final Hidden H = new Hidden();
        static Hidden get() { return H; }
    }
}
