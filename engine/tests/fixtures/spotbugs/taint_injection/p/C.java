package p;

import java.io.File;
import javax.servlet.http.HttpServletRequest;

public class C {
    static class Reads {
        Reads(String path) {
            new File(path);
        }
    }

    static class Wraps extends Reads {
        Wraps(String path) {
            super(path);
        }

        Wraps(int size, String path) {
            this(path);
        }
    }

    static class Quiet {
        Quiet(String path) {
            new File(path);
        }
    }

    static class Loud {
        Loud(String path) {
            new File(path);
        }
    }

    void make(HttpServletRequest request) {
        new Wraps(1, request.getParameter("a"));
        new Quiet("a");
        new Loud(request.getHeader("b"));
        build(request.getParameter("c"));
    }

    void build(String path) {
        new Loud(path);
    }
}
