package p;
public class D3 {
    private static D3 instance;
    private D3() {}
    public static D3 get() {
        if (instance == null) {
            instance = new D3();
        }
        return instance;
    }
}
