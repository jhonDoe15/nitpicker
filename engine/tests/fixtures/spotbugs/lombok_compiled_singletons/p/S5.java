package p;
import lombok.Value;
@Value
public class S5 {
    static S5 INSTANCE = new S5(1);
    int x;
    public static S5 getInstance() { return INSTANCE; }
}
