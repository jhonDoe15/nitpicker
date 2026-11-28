package p;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public class S2 {
    private static final S2 INSTANCE = new S2();
    public static S2 getInstance() { return INSTANCE; }
}
