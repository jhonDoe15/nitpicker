package p;
import lombok.Data;
@Data
public class D1 {
    public int x;
    public static int Y;
    private final int k = 7;
    public void touch() { x = 1; }
}
