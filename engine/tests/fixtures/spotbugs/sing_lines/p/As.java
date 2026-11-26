package p;
import java.io.Serializable;

public class As implements Serializable {

    private static final As INSTANCE = new As();
    private As() {}
    public static As getInstance() { return INSTANCE; }
    void check(int x) {
        assert x > 0;
    }
}
