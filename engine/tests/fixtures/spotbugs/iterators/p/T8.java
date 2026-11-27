package p;
import java.util.*;
public class T8 implements Iterator<String> {
    String[] a; int i;
    public boolean hasNext() { return true; }
    public String next() { return a[i++]; }
}
