package p;
import lombok.Getter;
public class S11 {
    @Getter(lazy = true)
    private final String value = compute();
    private static S11 instance;
    private S11() {}
    private static String compute() { return "x"; }
    public static synchronized S11 getInstance() {
        if (instance == null) {
            instance = new S11();
        }
        return instance;
    }
}
