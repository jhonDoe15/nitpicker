package n;

import java.util.Map;

class Dimensions {
    int method()[] {
        return null;
    }

    int nested()[][] {
        return null;
    }

    Void voids()[] {
        return null;
    }

    int plain(Map<String, Integer> counts) {
        return counts.get("a");
    }

    int[] fromMap(Map<String, int[]> rows)[] {
        return new int[][] {rows.get("a")};
    }

    int sum(Map<String, int[]> rows, Map<String, Integer> counts) {
        int values[] = rows.get("a");
        int count = counts.get("b");
        int both[] = null, single = counts.get("c");
        return values.length + count + both.length + single;
    }
}
