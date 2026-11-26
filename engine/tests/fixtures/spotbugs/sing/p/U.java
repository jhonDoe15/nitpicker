package p;
public class U {
    private static final U INSTANCE = new U(1);
    private U(int a) {}
    public U(String s,
             int b) {
        this(b);
        System.out.println(s);
    }
    U(long c) {
        this(1);
    }
    public static U getInstance() { return INSTANCE; }
}
