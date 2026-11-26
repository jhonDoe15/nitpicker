package e;

import java.util.logging.Level;
import java.util.logging.Logger;

public class Logs {
    private static final Logger LOG = Logger.getLogger("e");

    void log(String name, int count) {
        LOG.log(Level.FINE, "name " + name);
        LOG.log(Level.FINE, "plain");
        if (LOG.isLoggable(Level.FINE)) {
            LOG.log(Level.FINE, "guarded " + name);
        }
        LOG.log(Level.FINER, "count {0}", count);
        LOG.log(Level.FINEST, "length {0}", name.length());
        LOG.log(Level.INFO, "info " + name);
    }
}
