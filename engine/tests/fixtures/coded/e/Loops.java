package e;

import java.util.Iterator;
import java.util.List;

public class Loops {
    private int position;

    int sum(int[] values, List<String> names) {
        int total = 0;
        for (int i = 0; i < values.length; i++) {
            total += values[i];
        }
        for (int i = 0; i < names.size(); i++) {
            total += names.get(i).length();
        }
        for (int i = 0; i <= values.length - 1; i++) {
            total += values[i] * i;
        }
        for (Iterator<String> it = names.iterator(); it.hasNext(); ) {
            total += it.next().length();
        }
        for (int i = 0; i < values.length; i++) {
            if (values[i] < 0) {
                i++;
            }
        }
        for (String name : names) {
            name = name.trim();
            total += name.length();
        }
        for (; position < values.length; position++) {
            total += values[position];
        }
        return total;
    }
}
