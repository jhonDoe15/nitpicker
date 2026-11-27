package p;
import lombok.Builder;
@Builder
public class S7 {
    private static final S7 INSTANCE = new S7(1);
    private final int x;
    public static S7 getInstance() { return INSTANCE; }
}
