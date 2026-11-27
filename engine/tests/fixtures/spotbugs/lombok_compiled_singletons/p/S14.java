package p;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public class S14 {
    private static final S14 INSTANCE = new S14();
    public S14(int x) {}
    public static S14 getInstance() { return INSTANCE; }
}
