package g;

import java.sql.Connection;

class Foreign {
    @interface SuppressWarnings {
        String[] value();
    }

    Connection open() {
        return null;
    }

    @SuppressWarnings("PMD.CloseResource")
    void foreign() throws Exception {
        Connection c = open();
        c.isClosed();
    }

    @java.lang.SuppressWarnings("PMD.CloseResource")
    void own() throws Exception {
        Connection c = open();
        c.isClosed();
    }

    void sameLine() throws Exception {
        try { open(); } finally { open(); } Connection c = open();
        c.isClosed();
    }
}
