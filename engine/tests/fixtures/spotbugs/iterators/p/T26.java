package p;
import java.util.*;
public class T26 implements Iterator<String> {
    Deque<String> q;
    public boolean hasNext() { return true; }
    public String next() { return q.pop(); }
}
