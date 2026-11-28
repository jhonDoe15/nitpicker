package p;
import lombok.Data;
@Data
public class S4 {
    private static final S4 INSTANCE = new S4();
    private int x;
    public static S4 getInstance() { return INSTANCE; }
}
