package p;

import q.Unknown;

class Receivers extends Unknown {
    void read(Object o) {
        if (o instanceof String s) {
            s.isEmpty();
        } else {
            s.isEmpty();
        }
        boolean after = s.isEmpty();
        if (!(o instanceof String t)) {
            return;
        }
        t.isEmpty();
        if (o instanceof Integer n && n.intValue() > 0) {
            n.toString();
        }
        n.toString();
        while (!(o instanceof Long m)) {
            o = 1L;
        }
        m.longValue();
        String label = o instanceof Double d ? d.toString() : d.toString();
    }

    int labels(Object o) {
        return switch (o) {
            case String a, Integer b -> a.length() + b.hashCode();
            default -> 0;
        };
    }

}
