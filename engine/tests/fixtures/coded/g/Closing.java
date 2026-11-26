package g;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Objects;

class Closing {
    InputStream field;

    void notClosed(String path) throws IOException {
        InputStream in = new FileInputStream(path);
        in.read();
    }

    void closedInFinally(String path) throws IOException {
        InputStream in = new FileInputStream(path);
        try {
            in.read();
        } finally {
            in.close();
        }
    }

    void closedWhenNotNull(String path) throws IOException {
        InputStream in = null;
        try {
            in = new FileInputStream(path);
            in.read();
        } finally {
            if (in != null) {
                in.close();
            }
            if (Objects.nonNull(in)) {
                in.close();
            }
        }
    }

    void closedConditionally(String path, boolean flag) throws IOException {
        InputStream in = new FileInputStream(path);
        try {
            in.read();
        } finally {
            if (flag) {
                in.close();
            }
        }
    }

    void statementBetween(String path) throws IOException {
        InputStream in = new FileInputStream(path);
        System.out.println(path);
        try {
            in.read();
        } finally {
            in.close();
        }
    }

    void wrapped(String path) throws IOException {
        try (FileReader reader = new FileReader(path)) {
            BufferedReader buffered = new BufferedReader(reader);
            buffered.readLine();
        }
    }

    InputStream returned(String path) throws IOException {
        InputStream in = new FileInputStream(path);
        return in;
    }

    InputStream wrapsParameter(InputStream source) {
        InputStream in = source;
        return null;
    }

    void allowed() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(1);
    }

    void reassigned(String path) throws IOException {
        InputStream in = new FileInputStream(path);
        try {
            in = new FileInputStream(path + "2");
        } finally {
            in.close();
        }
    }

    void inferred(String url) throws SQLException {
        var connection = DriverManager.getConnection(url);
        Statement statement = connection.createStatement();
        statement.execute("x");
    }

    void helperClose(String url) throws SQLException {
        Connection connection = DriverManager.getConnection(url);
        try {
            connection.isClosed();
        } finally {
            Helpers.close(connection);
        }
    }

    void storedInField(String path) throws IOException {
        InputStream in = new FileInputStream(path);
        field = in;
    }

    Closing() throws IOException {
        InputStream in = new FileInputStream("x");
        in.read();
    }

    static final class Helpers {
        static void close(AutoCloseable closeable) {
        }
    }
}
