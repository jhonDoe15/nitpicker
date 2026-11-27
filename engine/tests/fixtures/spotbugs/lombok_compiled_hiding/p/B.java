package p;
import lombok.Getter;
import lombok.Builder;
public class B extends A {
    @Getter
    private static int count;
    public static String getName() { return "b"; }

    B(int v) { super(v); }
}
