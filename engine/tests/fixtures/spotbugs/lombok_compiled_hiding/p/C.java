package p;
import lombok.Getter;
public class C extends B {
    public static int getCount() { return 3; }
    @Getter
    private static int total;
    C() { super(1); }
}
