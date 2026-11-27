package p;
import java.util.*;
public class U19 {
    Iterator<String> it() {
        return new U2() {
            public String next() {
                return "z";
            }
        };
    }
}
