package p;
import java.util.*;
public class T5 implements Iterator<String> {
    public boolean hasNext() { return true; }
    public String next() { throw new UnsupportedOperationException(); }
}
