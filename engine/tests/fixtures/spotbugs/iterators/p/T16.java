package p;
import java.util.*;
public class T16 {
    Iterator<String> it() {
        return new Iterator<String>() {
            public boolean hasNext() { return true; }
            public String next() {
                return "z";
            }
        };
    }
}
