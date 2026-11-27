package p;
import lombok.Getter;
public class L1 {
    @Getter(lazy = true)
    private final String v = "q";
    private final int w = 3;
}
