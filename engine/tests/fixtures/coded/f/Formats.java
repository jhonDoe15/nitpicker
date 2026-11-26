package f;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
class Formats {
    private static final Logger LOG = LoggerFactory.getLogger(Formats.class);
    private static final String FMT = "a {} b {}";
    private final String inst = "x {}";
    private String mutable = "y {}";
    void m(boolean c, Exception e, Object o) {
        String s = "one {}";
        LOG.info(s);
        LOG.info(s, 1, 2);
        String t;
        if (c) { t = "p {} {}"; } else { t = "q {}"; }
        LOG.info(t, 1);
        String u = c ? "a {}" : "b";
        LOG.info(u);
        LOG.info(FMT, 1);
        LOG.info(inst);
        LOG.info(mutable);
        LOG.info("x {} {}", new Object[] {1, 2, 3});
        LOG.info("x {}", 1, e);
        LOG.info("x {} {}", 1, e);
        LOG.info("%s and %d %n %%", 1);
        LOG.error("{}", e);
        LOG.warn("none", o);
        String w = "w {}";
        w = "w2 {} {}";
        LOG.info(w, 1);
        for (String r : new String[] {"a {}"}) { LOG.info(r); }
        Runnable run = () -> LOG.info(s);
        String z = "z {}";
        try { z = "zz {} {}"; foo(); } catch (RuntimeException ex) { LOG.info(z); }
        LOG.debug("a {}" + "{}", 1);
    }
    void p(String param) { LOG.info(param); param = "x {}"; LOG.info(param); }
    void foo() {}
}
