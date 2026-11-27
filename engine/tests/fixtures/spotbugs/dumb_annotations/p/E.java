package p;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

public class E {
    @interface Plain {
    }

    @Retention(RetentionPolicy.SOURCE)
    @interface Src {
    }

    @Retention(RetentionPolicy.CLASS)
    @interface Cls {
    }

    @Retention(RetentionPolicy.RUNTIME)
    @interface Run {
    }

    boolean a(Class<?> c) {
        return c.isAnnotationPresent(Src.class);
    }

    boolean b(Class<?> c) {
        return c.isAnnotationPresent(Cls.class);
    }

    boolean c(Class<?> c) {
        return c.isAnnotationPresent(Run.class);
    }

    Object d(Class<?> c) {
        return c.getAnnotation(Plain.class);
    }

    boolean e(Method m) {
        return m.isAnnotationPresent(Plain.class);
    }

    Object f(Field f) {
        return f.getAnnotation(Plain.class);
    }

    Object g(Class<?> c) {
        return c.getDeclaredAnnotation(Plain.class);
    }

    Object h(Class<?> c) {
        return c.getAnnotationsByType(Plain.class);
    }

    boolean i(Class<?> c) {
        return c.isAnnotationPresent(Override.class) || c.isAnnotationPresent(SuppressWarnings.class) || c.isAnnotationPresent(Deprecated.class);
    }

    boolean j(Class<?> c) {
        return c.isAnnotationPresent(Plain.class) || c.isAnnotationPresent(Src.class);
    }

    boolean k(Class<?> c) {
        Class<Plain> p = Plain.class;
        return c.isAnnotationPresent(p);
    }

    boolean l(java.lang.reflect.AnnotatedElement x) {
        return x.isAnnotationPresent(Plain.class);
    }

    boolean m(Class<?> c) {
        return c.isAnnotationPresent(Other.class);
    }

    boolean n(Class<?> c) {
        return c.isAnnotationPresent(Plain.class) && c.isAnnotationPresent(Plain.class);
    }

    Object o(java.lang.reflect.Parameter x) {
        return x.getAnnotation(Plain.class);
    }
}
