package p;

public class S {
    private static int a = 1;
    private static int b;
    static int c;
    public static int d;
    protected static Object e = new Object();
    private static final Object f = new Object();
    public static final Object g = new Object();
    private final Object h = new Object();
    private final int i;
    private int j;
    private String k = "lit";
    private int l = 0;
    private Object m = null;
    private boolean n = false;
    private long o = 5L;
    private int[] p = {1};
    private static volatile int q;
    static {
        b = 2;
    }
    static void st() { c = 3; d = 4; q = 1; }
    S() {
        i = 1;
    }
    void w() { j = 1; }
    class In {
        private int x;
        int y;
        public int z;
        In() { x = 1; y = 1; z = 1; }
    }
    static class Nest {
        private int x;
        Nest() { x = 1; }
    }
    Object an() {
        return new Object() {
            private int x;
            public int y;
            { x = 1; y = 2; }
        };
    }
    void loc() {
        class Loc { private int x; Loc() { x = 1; } }
        new Loc();
    }
}
