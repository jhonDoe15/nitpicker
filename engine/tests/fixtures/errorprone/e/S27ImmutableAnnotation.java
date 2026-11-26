package e;

import com.google.errorprone.annotations.Immutable;
import com.google.errorprone.annotations.ImmutableTypeParameter;
import com.google.errorprone.annotations.concurrent.LazyInit;
import java.lang.annotation.Annotation;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import javax.annotation.processing.Generated;

/** Classes that implement an annotation interface must be immutable. */
public class S27ImmutableAnnotation {
  /** A base that has no state. */
  abstract static class Base implements Annotation {
    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }
  }

  static class NonFinal implements Deprecated {
    int x;
    private int y, z;
    final int fine = 1;
    @LazyInit int lazy;
    static int shared;

    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }

    public boolean forRemoval() {
      return false;
    }

    public String since() {
      return "";
    }
  }

  static class Mutable extends Base {
    final Set<Integer> xs = new HashSet<>();
    final List<String> names = new ArrayList<>();
    final Object any = null;
    final int[] numbers = {};
    final String text = "";
    final Class<?> kind = null;
    final Foo foo = null;
    final Annotation annotation = null;
    final Map.Entry<String, String> entry = null;
    final Map<String, Foo> mapped = null;
    @SuppressWarnings("Immutable")
    int quiet;
    @SuppressWarnings("ImmutableAnnotationChecker")
    int quieter;
    @SuppressWarnings("all")
    int quietest;
  }

  static class Foo {}

  @Immutable
  static class Frozen {}

  @Immutable
  static class Annotated extends Base {}

  @com.google.errorprone.annotations.Immutable
  static class Qualified extends Base {}

  @Immutable
  abstract static class Sub implements Deprecated {}

  static class FrozenField extends Base {
    final Frozen frozen = null;
    final FrozenSub child = null;
  }

  static class FrozenSub extends Frozen {}

  static class Holder<T> extends Base {
    final T value = null;
    final List<T> values = null;
  }

  @Immutable(containerOf = "T")
  static class Container<T> {}

  static class Contained extends Base {
    final Container<String> text = null;
    final Container<Foo> foo = null;
    final Container<List<String>> list = null;
    final Container raw = null;
    final Container<?> wild = null;
  }

  static class Outer extends Base {
    int count;

    class Inner extends Base {
      void touch() {
        Objects.requireNonNull(Outer.this);
      }
    }

    class Quiet extends Base {}

    static class Nested extends Base {}
  }

  static class SuperMutable extends Mutable {
    final int ok = 1;
  }

  static class SuperFields extends Plain {}

  static class Plain {
    int shown;
    final List<String> things = null;
  }

  static class SuperAnnotated extends Frozen implements Annotation {
    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }
  }

  static class ImplementsInterface implements Annotation, Comparable<ImplementsInterface> {
    int count;

    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }

    public int compareTo(ImplementsInterface other) {
      return 0;
    }
  }

  interface Marker extends Annotation {
    int NUMBER = 1;
  }

  enum Kind implements Annotation {
    ONE,
    TWO {
      int extra;
    };

    int moving;

    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }
  }

  record Pair(List<String> items, int count) implements Annotation {
    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }
  }

  record Safe(int count, String name) implements Annotation {
    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }
  }

  @Generated("com.google.auto.value.processor.AutoAnnotationProcessor")
  static class Generated1 implements Deprecated {
    int x;

    public Class<? extends Annotation> annotationType() {
      return Deprecated.class;
    }

    public boolean forRemoval() {
      return false;
    }

    public String since() {
      return "";
    }
  }

  @Generated("other")
  static class Generated2 extends Base {
    int x;
  }

  void anonymous(int local) {
    new Deprecated() {
      public Class<? extends Annotation> annotationType() {
        return Deprecated.class;
      }

      public boolean forRemoval() {
        return false;
      }

      public String since() {
        return "";
      }
    };
    new Base() {
      int count;
    };
    new Base() {
      final List<String> names = null;
    };
    new Base() {
      void touch() {
        Objects.requireNonNull(S27ImmutableAnnotation.this);
      }
    };
    new Base() {
      void touch() {
        System.err.println(local);
      }
    };
    new Base() {};
  }

  static void staticAnonymous() {
    new Base() {
      int count;
      void touch() {
        Objects.requireNonNull(new S27ImmutableAnnotation());
      }
    };
  }

  void local() {
    class LocalAnnotation extends Base {
      int count;
    }

    class Quiet extends Base {
      void touch() {
        Objects.requireNonNull(S27ImmutableAnnotation.this);
      }
    }
  }
}
