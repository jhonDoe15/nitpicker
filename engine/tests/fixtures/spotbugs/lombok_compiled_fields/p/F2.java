package p;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
@FieldDefaults(makeFinal = true)
public class F2 {
    int a = 1;
    String b = "x";
    @NonFinal int c = 2;
    public static String D = "d";
    public int e = 4;
}
