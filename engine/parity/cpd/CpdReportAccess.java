package net.sourceforge.pmd.cpd;

import java.lang.reflect.Method;
import java.nio.file.Path;

final class CpdReportAccess {
    static Object lexable(Path file, String text) throws Exception {
        Method m = Class.forName("CpdReport").getDeclaredMethod("lexable", Path.class, String.class);
        m.setAccessible(true);
        return m.invoke(null, file, text);
    }
}
