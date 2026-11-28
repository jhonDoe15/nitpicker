package p;
import lombok.Getter;
import lombok.Setter;
public class D2 {
    @Getter @Setter
    public int x;
    @Getter
    public static String[] names = {"a"};
    public void touch() { x = 1; }
    public static String[] all() { return names; }
}
