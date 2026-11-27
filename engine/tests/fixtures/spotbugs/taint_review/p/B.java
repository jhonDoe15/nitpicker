package p;

import java.io.File;
import javax.servlet.http.HttpServletRequest;

public class B {
    void t1(HttpServletRequest r) {
        new File(A.b(r.getParameter("p"), true));
    }

    void t2(HttpServletRequest r) {
        new File(C.d(r.getParameter("p"), 3));
    }
}
