package p;
import lombok.Synchronized;
public class S6 {
    private static S6 instance;
    private S6() {}
    @Synchronized
    public static S6 getInstance() {
        if (instance == null) {
            instance = new S6();
        }
        return instance;
    }
}
