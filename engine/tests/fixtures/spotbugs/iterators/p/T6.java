package p;
import java.util.*;
public class T6 implements Iterator<String> {
    List<String> l; int i;
    public boolean hasNext() { return true; }
    public String next() { return l.get(i++); }
}
