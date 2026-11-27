package demo.app.api;

import demo.app.internal.Cache;
import java.sql.Connection;
import java.sql.SQLException;
import lib.Nullable;
import lib.Store;
import lib.loose.Lookup;

public class Accounts {
    private String name;
    @Nullable private Connection connection;

    public Accounts() {}

    public String label() {
        return null;
    }

    public int size() {
        return Store.find("size").length();
    }

    public void close() throws SQLException {
        connection.close();
    }

    public String cached() {
        return Cache.lookup(null);
    }

    public String required() {
        return Store.require(Store.find("x"));
    }

    public int loose() {
        return Lookup.find("loose").length();
    }
}
