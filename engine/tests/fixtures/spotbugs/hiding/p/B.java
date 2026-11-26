package p;
public class B extends A {
    public static void f() {
        System.gc();
    }
    protected static int g(int x) {
        return x + 1;
    }
    static void h() {
        System.gc();
    }
    private static void k() {
        System.gc();
    }
    public static String r() {
        return null;
    }
    public static <T> T gen(T t) {
        return null;
    }
    public static void main(String[] args) {
        System.gc();
    }
    public static void over(long a) {
        System.gc();
    }
}
