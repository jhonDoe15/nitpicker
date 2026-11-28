package p;

import java.util.Map;
import java.util.stream.Collectors;

public class Values {
    public Map<String, Object> checked(Map<String, Object> source) {
        return source.entrySet().stream()
            .filter(e -> e.getValue() instanceof String)
            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public Map<String, Object> bound(Map<String, Object> source) {
        return source.entrySet().stream()
            .filter(e -> e.getValue() instanceof String text && !text.isEmpty())
            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public Map<String, Object> unchecked(Map<String, Object> source) {
        return source.entrySet().stream()
            .filter(e -> e.getKey().length() > 2)
            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public long late(int seconds, long start) {
        return start + (seconds * 1000);
    }

    public long early(int seconds, long start) {
        return start + ((long) seconds * 1000);
    }

    public int compare(Values a, Values b, long left, long right) {
        return (int) ((left - right));
    }

    public boolean joined(String name) {
        return "id=" + (name) != null;
    }

    public boolean grouped(String name, String rest) {
        return ("id=" + (name + rest)) == null;
    }
}
