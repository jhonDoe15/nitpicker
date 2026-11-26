package p;
public class D5 {
    private static D5 instance;
    private D5() {}
    public static D5 get() {
        synchronized (D5.class) {
            if (instance == null) {
                instance = new D5();
            }
        }
        return instance;
    }
}
