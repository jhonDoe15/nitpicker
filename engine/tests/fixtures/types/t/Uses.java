package t;

import static java.util.Map.Entry;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

class Uses {
    static class Entry {
    }

    String text = "a";
    List<String> names = new ArrayList<>();
    Object[] things = new Object[1];
    int[] counts = new int[2];
    Integer boxed = 3;
    Entry entry = null;

    void use(Map<String, Integer> map, Collection<? extends Number> numbers) {
        var copy = new ArrayList<>(names);
        copy.add(text.trim());
        Serializable kept = things;
        Cloneable cloned = counts;
        StringBuilder builder = new StringBuilder();
        builder.append(1).append('c').append("s").append(boxed);
        String.format("%s %s", text, boxed);
        String.join(",", names);
        String.join(",", "a", "b");
        map.getOrDefault("k", 0);
        numbers.stream().mapToInt(Number::intValue).sum();
        Math.max(1, 2L);
        Math.max(1.0f, 2);
        List.of(1, 2, 3).size();
        java.util.Arrays.asList(things).isEmpty();
    }
}
