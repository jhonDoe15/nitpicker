package d;

import java.io.Closeable;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

public class Checks {
    private Checks inner;
    private String name;
    private Integer boxed;
    private static Checks instance;
    private static volatile Checks shared;
    private static final java.text.SimpleDateFormat FORMAT = new java.text.SimpleDateFormat("yyyy");

    String getName() {
        return name;
    }

    boolean broken(Checks other, String text) {
        boolean a = other == null && other.name.isEmpty();
        boolean b = other != null || other.getName().isEmpty();
        boolean c = other != null && other.getName().isEmpty();
        boolean d = boxed == null && boxed > 1;
        boolean e = this.inner == null && inner.name != null;
        boolean f = text == null || text.length() == 0;
        return a || b || c || d || e || f;
    }

    boolean conditions(Object value, Checks other) {
        boolean a = value != null && value instanceof String;
        boolean b = value == null || !(value instanceof String);
        boolean c = other.inner != null && other.inner instanceof Checks;
        boolean d = value instanceof String && value != null;
        return a || b || c || d;
    }

    int ternaries(int a, boolean flag) {
        int x = a != 1 ? 2 : 3;
        int y = !flag ? 2 : 3;
        int z = a != 1 && !flag ? 1 : 0;
        int w = a == 1 ? 2 : 3;
        if (a != 2) {
            x++;
        } else {
            y++;
        }
        if (!flag) {
            x++;
        } else if (a == 1) {
            y++;
        }
        return x + y + z + w;
    }

    void nulls(String text) {
        String a = text;
        a = null;
        name = flagged() ? null : text;
        final String b;
        b = null;
        String c = text.isEmpty() ? null : text;
        inner = text.isEmpty() ? (text.isBlank() ? null : this) : this;
    }

    boolean flagged() {
        return name.isEmpty();
    }

    void operands(InputStream in) throws IOException {
        int read;
        while ((read = in.read()) != -1) {
            name = name + read;
        }
        int i = 0;
        if ((i = in.read()) > 0) {
            i++;
        }
        for (int j = 0; j++ < 3;) {
            i += j;
        }
        if (i++ > 3) {
            i--;
        }
    }

    void resources(String path) throws IOException {
        InputStream in = null;
        try {
            in = new FileInputStream(path);
            in.read();
        } finally {
            if (in != null) {
                in.close();
            }
        }
        Closeable other = null;
        try {
            other = new FileInputStream(path);
        } finally {
            quietly(other);
        }
    }

    static void quietly(Closeable closeable) {
    }

    static Checks getInstance() {
        if (instance == null) {
            instance = new Checks();
        }
        return instance;
    }

    static Checks getShared() {
        if (shared == null) {
            synchronized (Checks.class) {
                if (shared == null) {
                    shared = new Checks();
                }
            }
        }
        return shared;
    }

    Checks lazy() {
        if (inner == null) {
            synchronized (this) {
                if (inner == null) {
                    inner = new Checks();
                }
            }
        }
        return inner;
    }

    String format(java.util.Date date) {
        String first = FORMAT.format(date);
        synchronized (FORMAT) {
            first += FORMAT.format(date);
        }
        return first;
    }

    int loops(int[] values) {
        for (int value : values) {
            if (value > 1) {
                return value;
            }
            break;
        }
        while (values.length > 2) {
            continue;
        }
        do {
            return 1;
        } while (true);
    }
}
