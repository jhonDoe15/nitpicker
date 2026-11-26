package p;
public class B2 {
    int a = 1;
    private static final B2 INSTANCE = new B2();
    int b = 2;
    public B2() {
        System.out.println(a);
    }
    public static B2 getInstance() { return INSTANCE; }
}
