package p;
import lombok.Getter;
public class S1 {
    @Getter
    private static final S1 INSTANCE = new S1();
    private S1() {}
}
