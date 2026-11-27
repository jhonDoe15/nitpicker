package p;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class S10 {
    private static S10 instance;
    public static S10 getInstance() {
        if (instance == null) {
            instance = new S10();
        }
        return instance;
    }
}
