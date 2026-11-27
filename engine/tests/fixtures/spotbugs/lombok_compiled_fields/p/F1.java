package p;
import lombok.experimental.FieldDefaults;
import lombok.AccessLevel;
@FieldDefaults(level = AccessLevel.PUBLIC)
public class F1 {
    int a;
    String b = "b";
    static int c;
    static String[] d = {"x"};
    void set() { a = 2; b = "c"; }
}
