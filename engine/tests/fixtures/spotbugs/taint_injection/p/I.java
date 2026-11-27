package p;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import javax.naming.NamingException;
import javax.naming.directory.DirContext;
import javax.naming.directory.SearchControls;
import javax.persistence.EntityManager;
import javax.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;

public class I {
    private final File base = new File(System.getenv("BASE"));

    I() {}

    I(int size) {
        this();
    }

    I(String name) {}

    void jdbc(Statement statement, Connection connection, HttpServletRequest request) throws SQLException {
        statement.executeQuery(request.getParameter("q"));
        statement.execute("select 1");
        connection.prepareStatement("select " + request.getParameter("a"));
        statement.addBatch(name());
        statement.addBatch(System.getenv("Q"));
    }

    String name() {
        return "x";
    }

    void path(String path, HttpServletRequest request) throws IOException {
        new FileInputStream(path);
        new FileOutputStream(request.getParameter("f"));
        Paths.get(path);
        Paths.get("a", "b", path);
        new File(new File(path), "a");
        new File(new File("a"), path);
        new File("a", "b");
        new Sub(path);
    }

    static class Sub extends File {
        Sub(String path) {
            super(path);
        }
    }

    void command(String line, String[] lines, List<String> list) throws IOException {
        Runtime.getRuntime().exec(line);
        Runtime.getRuntime().exec("ls");
        new ProcessBuilder(lines);
        new ProcessBuilder("ls", line);
        new ProcessBuilder("ls", "-l");
        new ProcessBuilder(list).command(lines);
    }

    void ldap(DirContext context, String filter) throws NamingException {
        context.search("ou=x", filter, new SearchControls());
        context.search("ou=x", "(cn=a)", new SearchControls());
    }

    void spring(JdbcTemplate template, String query) {
        template.queryForList(query);
        template.execute("delete from t");
    }

    void jpa(EntityManager manager, String query) {
        manager.createQuery(query);
        manager.createNativeQuery(
            query);
        String built = query
            + new StringBuilder(manager.createQuery("a").toString()).append(
                query);
        new File(
            built);
    }

    void caller(HttpServletRequest request) throws IOException {
        path(request.getParameter("x"), request);
    }
}
