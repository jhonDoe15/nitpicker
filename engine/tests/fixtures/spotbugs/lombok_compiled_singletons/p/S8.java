package p;
import lombok.AllArgsConstructor;
import lombok.AccessLevel;
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class S8 implements Cloneable {
    private static final S8 INSTANCE = new S8(2);
    private int x;
    public static S8 getInstance() { return INSTANCE; }
}
