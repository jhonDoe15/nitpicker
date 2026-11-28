package s;
import javax.naming.*;
import javax.naming.directory.*;
import java.util.*;

public class S4 {
    static void keep(Object o) {
    }
    static final String NONE = "none";
    void a() {
        Hashtable<String, String> env = new Hashtable<>();
        env.put(Context.SECURITY_AUTHENTICATION, "none");
    }
    void b() {
        Hashtable<String, String> env = new Hashtable<>();
        env.put(Context.SECURITY_AUTHENTICATION, "simple");
    }
    void c() {
        Properties env = new Properties();
        env.put("java.naming.security.authentication", "none");
    }
    void d() {
        Properties env = new Properties();
        env.setProperty(Context.SECURITY_AUTHENTICATION, "none");
    }
    void e(Map<String, Object> env) {
        env.put(Context.SECURITY_AUTHENTICATION, NONE);
    }
    void f() {
        Hashtable<String, String> env = new Hashtable<>();
        env.put(Context.SECURITY_AUTHENTICATION, "NONE");
    }
    void g(Hashtable<Object, Object> env, String v) {
        env.put(Context.SECURITY_AUTHENTICATION, v);
        env.put("x", "none");
    }
    void h() throws Exception {
        DirContext ctx = new InitialDirContext();
        ctx.addToEnvironment(Context.SECURITY_AUTHENTICATION, "none");
    }
    void i() {
        HashMap<String, String> env = new HashMap<>();
        env.put(Context.SECURITY_AUTHENTICATION, "none");
    }
    void search() {
        keep(new SearchControls(1, 0, 0, null, true, false));
        keep(new SearchControls(1, 0, 0, null, false, false));
        SearchControls s = new SearchControls();
        s.setReturningObjFlag(true);
        s.setReturningObjFlag(false);
        boolean on = true;
        s.setReturningObjFlag(on);
    }
    void search2(boolean x) {
        SearchControls s = new SearchControls();
        s.setReturningObjFlag(x);
        keep(new SearchControls(1, 0, 0, null, x, false));
    }
}
