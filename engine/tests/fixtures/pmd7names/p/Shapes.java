package p;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public interface Shapes {
    Logger LOG = LoggerFactory.getLogger(ShapesHelper.class);

    void tag(String tag);

    void tags(List<String> tags);

    default void draw(boolean filled) {
        if (filled) {
            LOG.info("filled");
        }
    }

    interface Inner {
        default void paint(boolean filled) {
            if (filled) {
                LOG.info("painted");
            }
        }
    }
}

interface Hidden {
    default void show(boolean visible) {
        if (visible) {
            System.out.println("shown");
        }
    }
}

class ShapesHelper {
}
