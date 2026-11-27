package p;
import java.util.*;
public class T21 implements Iterator<String> {
    TreeMap<String, String> m;
    public boolean hasNext() { return true; }
    public String next() { return m.firstKey(); }
}
