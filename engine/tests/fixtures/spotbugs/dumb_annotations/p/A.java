package p;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Parameter;

public class A {
    @interface Plain {
    }

    static class Own {
        boolean isAnnotationPresent(Class<?> c) {
            return false;
        }
    }

    boolean field(Field f) {
        return f.isAnnotationPresent(Plain.class);
    }

    boolean ctor(Constructor<?> c) {
        return c.isAnnotationPresent(Plain.class);
    }

    boolean param(Parameter p) {
        return p.isAnnotationPresent(Plain.class);
    }

    boolean own(Own o) {
        return o.isAnnotationPresent(Plain.class);
    }

    boolean pkg(Package p) {
        return p.isAnnotationPresent(Plain.class);
    }

    boolean ternary(Class<?> c, boolean b) {
        return c.isAnnotationPresent(b ? Plain.class : Plain.class);
    }

    boolean param2(Class<?> c, Class<Plain> p) {
        return c.isAnnotationPresent(p);
    }

    boolean native2(Class<?> c) {
        return c.isAnnotationPresent(java.lang.annotation.Native.class) || c.isAnnotationPresent(FunctionalInterface.class) || c.isAnnotationPresent(SafeVarargs.class);
    }

    boolean lib(Class<?> c) {
        return c.isAnnotationPresent(com.google.common.annotations.VisibleForTesting.class) || c.isAnnotationPresent(org.junit.Test.class);
    }

    boolean lambda(Class<?> c) {
        java.util.function.BooleanSupplier s = () -> c.isAnnotationPresent(Plain.class);
        return s.getAsBoolean();
    }

    boolean self() {
        return getClass().isAnnotationPresent(Plain.class);
    }

    boolean arr(Class<?> c) {
        return c.isAnnotationPresent(Plain[].class.getComponentType().asSubclass(Plain.class));
    }
}
