package p;
import lombok.EqualsAndHashCode;
@EqualsAndHashCode
public class S13 {
    private static final S13 INSTANCE = new S13();
    public static S13 getInstance() { return INSTANCE; }
}
