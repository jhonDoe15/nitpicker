package p;
import java.util.*;
public class T27 implements Iterator<String> {
    public boolean hasNext() { return true; }
    public String next() { return new StringBuilder().append(1).toString(); }
}
