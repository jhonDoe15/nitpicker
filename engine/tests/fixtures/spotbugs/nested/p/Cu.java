package p;
import java.util.*;
public final class Cu {
    private final static Iterator<?> EMPTY_ITERATOR = Collections.emptyIterator();
    private final static Iterator<?> OTHER = new ArrayList<String>().iterator();
    @SuppressWarnings("unchecked")
    public static <T> Iterator<T> emptyIterator() { return (Iterator<T>) EMPTY_ITERATOR; }
    public static Iterator<?> plain() { return EMPTY_ITERATOR; }
    public static Iterator<?> other() { return OTHER; }
}
