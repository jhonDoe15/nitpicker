package q;
public class O2 {
    int compare(Object o1, Object o2) {
        final String string1 = o1.toString();
        final String string2 = o2.toString();
        if (string1 == string2) {
            return 0;
        }
        if (string1 == null) {
            return 1;
        }
        if (string2 == null) {
            return -1;
        }
        return string1.compareTo(string2);
    }
    int b(Object o1) {
        String s = o1.toString();
        if (s == null) {
            return 1;
        }
        return 0;
    }
}
