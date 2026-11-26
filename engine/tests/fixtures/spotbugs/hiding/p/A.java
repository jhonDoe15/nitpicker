package p;
public class A {
    public static void f() {
        System.gc();
    }
    protected static int g(int x) {
        return x;
    }
    static void h() {
        System.gc();
    }
    private static void k() {
        System.gc();
    }
    public static Object r() {
        return null;
    }
    public static <T> T gen(T t) {
        return t;
    }
    public static void main(String[] args) {
        System.gc();
    }
    public static void over(int a) {
        System.gc();
    }
    public static void over(long a) {
        System.gc();
    }
}
