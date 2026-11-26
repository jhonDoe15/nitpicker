package p;

import java.util.*;
import java.util.function.*;

public class R {
    static class Entry {
        double score() { return 1; }
        int priority() { return 1; }
        String name() { return ""; }
    }

    static <T> T pick(Function<T, String> named) { return null; }

    void comparators(List<Entry> entries) {
        Comparator<Entry> a = Comparator.comparingDouble(Entry::score).reversed().thenComparing(entry -> entry.name());
        entries.sort(Comparator.comparingInt(Entry::priority).thenComparing(entry -> entry.name()));
        Comparator<Entry> b = Comparator.comparing(Entry::name).thenComparing(entry -> entry.priority());
        Entry picked = pick(Entry::name);
        Runnable use = () -> System.out.println(Comparator.comparing(Entry::name).reversed());
    }
}
