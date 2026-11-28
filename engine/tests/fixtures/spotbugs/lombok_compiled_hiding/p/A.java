package p;
import lombok.Getter;
import lombok.Builder;
@Builder
public class A {
    @Getter
    private static int count;
    @Getter
    protected static String name;
    private final int v;
    public static int total() { return 1; }
}
