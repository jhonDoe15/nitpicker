package d;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Properties;

public class Members implements Serializable {
    private static final long serialVersionUID = 1L;
    private int unused;
    private int readElsewhere;
    private int written;
    @Deprecated
    private int annotated;
    private int[] values;
    private static int[] cached = new int[0];
    private static int[] table = {1, 2};
    private ArrayList<String> names = new ArrayList<>();
    private Properties properties;

    public Members(int unusedToo, int[] given) {
        this.values = given;
        written = 1;
    }

    private void helper(int used, int ignoredValue, String spare) {
        System.out.println(used);
    }

    public void open(int notChecked) {
        helper(1, 2, "a");
        Members other = new Members(1, new int[] {1});
        System.out.println(other.readElsewhere);
    }

    public int[] values() {
        return values;
    }

    public int[] table() {
        return table;
    }

    public int[] cached() {
        return cached;
    }

    public HashMap<String, Integer> map(ArrayList<String> list) {
        HashMap<String, Integer> made = new HashMap<>();
        List<String> loose = new ArrayList<>(list);
        return made;
    }

    public static Members getInstance() {
        Members made = new Members(1, null);
        return made;
    }

    public boolean equals(Object other) {
        return other == this;
    }

    static class Valued {
        public int hashCode() {
            return 1;
        }
    }

    static class Both {
        public boolean equals(Object other) {
            return false;
        }

        public int hashCode() {
            return 0;
        }
    }

    Object wrappers(String text, boolean flag) {
        Integer a = new Integer(1);
        Boolean b = new Boolean(true);
        Boolean c = new Boolean(text);
        Boolean d = Boolean.valueOf("false");
        Boolean e = Boolean.valueOf(flag);
        Character f = new Character('c');
        return List.of(a, b, c, d, e, f);
    }

    static void varargs(Object... args) {
    }

    static void strings(String... args) {
    }

    void calls(String[] names) {
        varargs(new Object[] {"a"});
        varargs(new String[] {"a"});
        varargs(names);
        varargs((Object) names);
        strings(new String[] {"a", "b"});
        strings(names);
        strings("a", "b");
        varargs(null, null);
    }
}
