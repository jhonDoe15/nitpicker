package p;
import lombok.RequiredArgsConstructor;
@RequiredArgsConstructor
public class S9 implements java.io.Serializable {
    private static final S9 INSTANCE = new S9("a");
    private final String name;
    public static S9 getInstance() { return INSTANCE; }
}
