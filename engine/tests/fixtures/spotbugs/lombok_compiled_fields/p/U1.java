package p;
import lombok.experimental.UtilityClass;
@UtilityClass
public class U1 {
    public String name = "n";
    public int[] values = {1, 2};
    protected int count;
    public final int max = 9;
    public void bump() { count++; name = "m"; }
}
