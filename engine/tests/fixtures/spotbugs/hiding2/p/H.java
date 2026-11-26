package p;
public class H extends G<Integer> {
    public static <U extends Number> void s(U u) {
        System.out.println(u);
    }
    static void plain(Object o) {
        System.out.println(o);
    }
    public static void main(String... args) {
        System.out.println(args);
    }
    static void main(int x) {
        System.out.println(x);
    }
    static class In extends H {
        static void plain(Object o) {
            System.out.println(o);
        }
    }
    Object anon() {
        return new G<Long>() {
            static void plain(Object o) {
                System.out.println(o);
            }
        };
    }
}
