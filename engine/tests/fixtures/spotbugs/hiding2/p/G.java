package p;
public class G<T extends Number> {
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
}
