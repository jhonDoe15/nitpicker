import static com.google.common.collect.ImmutableList.toImmutableList;

import com.google.common.collect.ImmutableList;
import java.util.ArrayList;
import java.util.List;

class S23ImmutableSetBranches {
  static class Of {
    private static final ImmutableList<String> L = ImmutableList.of("hello");

    boolean f() {
      return L.contains("x");
    }
  }

  static class CopyOf {
    private static final ImmutableList<String> L = ImmutableList.copyOf(new ArrayList<String>());

    boolean f() {
      return L.isEmpty();
    }
  }

  static class Collected {
    private static final ImmutableList<String> L = new ArrayList<String>().stream().collect(toImmutableList());

    boolean f() {
      return L.isEmpty();
    }
  }

  static class BuilderMethod {
    private static final ImmutableList<String> L =
        ImmutableList.<String>builder().add("hello").addAll(new ArrayList<String>()).build();

    boolean f() {
      return L.contains("x");
    }
  }

  static class BuilderNew {
    private static final ImmutableList<String> L =
        new ImmutableList.Builder<String>().add("hello").build();

    boolean f() {
      return L.containsAll(new ArrayList<String>());
    }
  }

  static class BuilderOnly {
    private static final ImmutableList<String> L = new ImmutableList.Builder<String>().build();

    boolean f() {
      return L.isEmpty();
    }
  }

  static class BuilderBare {
    private static final ImmutableList<String> L = ImmutableList.<String>builder().build();

    boolean f() {
      return L.isEmpty();
    }
  }

  static class Helper {
    private static final ImmutableList<String> L = make();

    private static ImmutableList<String> make() {
      return ImmutableList.of();
    }

    boolean f() {
      return L.contains("x");
    }
  }

  static class Raw {
    private static final ImmutableList L = ImmutableList.of("hello");

    boolean f() {
      return L.contains("x");
    }
  }

  static class Qualified {
    private static final com.google.common.collect.ImmutableList<String> L = com.google.common.collect.ImmutableList.of("a");

    boolean f() {
      return L.contains("x");
    }
  }

  static class Multi {
    private static final ImmutableList<String> A = ImmutableList.of("a");
    private static final ImmutableList<String> B = ImmutableList.copyOf(new ArrayList<String>());
    private static final ImmutableList<String> C = ImmutableList.<String>builder().add("c").build();

    boolean f() {
      return A.contains("x") || B.isEmpty() || C.containsAll(List.of());
    }
  }
}
