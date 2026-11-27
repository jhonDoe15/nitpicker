package p;
import java.util.*;
public class W1 implements Iterator<String> {
    int i;
    public boolean hasNext() { return i < 3; }
    public String next() { return "x"; }
}
