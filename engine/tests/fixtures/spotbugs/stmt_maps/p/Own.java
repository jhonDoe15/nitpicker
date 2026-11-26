package p;

import java.util.HashMap;
import java.util.Map;

public class Own extends HashMap<String, Integer> {
    private static final long serialVersionUID = 1L;
    static final Map<String, Integer> TABLE = new HashMap<>();
    static int total;

    static {
        for (String key : TABLE.keySet()) {
            total += TABLE.get(key);
        }
    }

    int sum() {
        int sum = 0;
        for (String key : keySet()) {
            sum += get(key);
        }
        return sum;
    }

    Integer first(Map<String, Integer> source) {
        String key = source.keySet().iterator().next();
        return source.get(key);
    }

    int two(Map<String, Map<String, Integer>> nested) {
        int sum = 0;
        for (String outer : nested.keySet()) {
            Map<String, Integer> inner = nested.get(outer);
            for (String name : inner.keySet()) {
                sum += inner.get(name);
            }
        }
        return sum;
    }
}
