package p;
import java.util.*;
public class T25 implements Iterator<String> {
    Object o;
    public boolean hasNext() { return true; }
    public String next() { return (String) o; }
}
