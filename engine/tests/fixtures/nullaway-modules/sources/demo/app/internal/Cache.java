package demo.app.internal;

import java.sql.ResultSet;
import java.sql.SQLException;
import lib.Nullable;

public final class Cache {
    private Cache() {}

    public static String lookup(String key) {
        return key.trim();
    }

    @Nullable
    static ResultSet rows() {
        return null;
    }

    static String first() throws SQLException {
        return rows().getString(1);
    }

    static int count(@Nullable String text) {
        return text.length();
    }

    static void show(String text) {
        try {
            System.out.println(text.strip());
        } catch (RuntimeException e) {
        }
    }
}
