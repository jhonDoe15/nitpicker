package p;
public class E {
    private static E instance;
    public E() {}
    public static synchronized E get() {
        if (instance == null) {
            instance = new E();
        }
        return instance;
    }
}
