package p;
import lombok.Value;
import lombok.experimental.NonFinal;
@Value
public class W1 {
    @NonFinal int x = 5;
    @NonFinal public int y;
    void bump() { y = 2; }
}
