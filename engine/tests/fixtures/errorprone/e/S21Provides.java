import com.google.common.collect.ImmutableSet;
import com.google.common.collect.ImmutableSortedSet;
import com.google.common.collect.Sets;
import dagger.Module;
import dagger.Provides;
import dagger.multibindings.ElementsIntoSet;
import dagger.producers.Produces;
import java.io.Closeable;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.TimeUnit;

class S21CloseableProvides {
  @com.google.inject.Provides
  Closeable closeable() {
    throw new UnsupportedOperationException();
  }

  @Provides
  InputStream stream() {
    throw new UnsupportedOperationException();
  }

  @Provides
  FileInputStream file() {
    throw new UnsupportedOperationException();
  }

  @Provides
  <T extends Closeable> T generic() {
    throw new UnsupportedOperationException();
  }

  @Provides
  <T> T unbounded() {
    throw new UnsupportedOperationException();
  }

  @Provides
  String text() {
    return "";
  }

  @Provides
  Object object() {
    throw new UnsupportedOperationException();
  }

  Closeable notProvides() {
    throw new UnsupportedOperationException();
  }

  @SuppressWarnings("CloseableProvides")
  @Provides
  Closeable suppressed() {
    throw new UnsupportedOperationException();
  }

  @Provides
  void nothing() {}
}

@Module
class S21EmptyPlain {
  @Provides
  @ElementsIntoSet
  Set<?> provideEmpty() {
    return new HashSet<>();
  }
}

@Module
final class S21EmptyFinal {
  @Provides
  @ElementsIntoSet
  public static final Set<String> provideEmpty() {
    return Sets.newHashSet();
  }
}

class S21EmptyUnannotated {
  @Provides
  @ElementsIntoSet
  Set<String> provideEmpty() {
    return Collections.emptySet();
  }
}

class S21EmptyPublic {
  @Produces
  @ElementsIntoSet
  Set<String> provideEmpty() {
    return ImmutableSet.of();
  }
}

@Module abstract class S21EmptyAbstract {
  @Provides @ElementsIntoSet public static Set<String> one() { return new LinkedHashSet<>(); }
}

@Module(includes = S21EmptyPlain.class)
class S21EmptyIncludes {
  @SuppressWarnings("unused")
  @Provides
  @ElementsIntoSet
  protected Set<String> two() {
    return ImmutableSortedSet.of();
  }
}

@Module(injects = S21EmptyPlain.class)
class S21EmptyDaggerOne {
  @Provides
  @ElementsIntoSet
  Set<String> three() {
    return new TreeSet<>();
  }
}

@Module(library = true)
class S21EmptyLibrary {
  @Provides
  @ElementsIntoSet
  Set<TimeUnit> four() {
    return EnumSet.noneOf(TimeUnit.class);
  }
}

@Module
interface S21EmptyInterface {
  @Provides
  @ElementsIntoSet
  static Set<String> five() {
    return Collections.emptySet();
  }
}

@Module
enum S21EmptyEnum {
  A;

  @Provides
  @ElementsIntoSet
  static Set<String> six() {
    return Collections.emptySet();
  }
}

@Module
class S21EmptyFlags {
  @Provides
  @ElementsIntoSet
  synchronized public final Set<String> seven() {
    return Collections.emptySet();
  }

  /** @deprecated nope. */
  @Deprecated
  @Provides
  @ElementsIntoSet
  Set<String> eight() {
    return Collections.emptySet();
  }
}

@Module
class S21EmptyOuter {
  @Module
  static class Inner {
    @Provides
    @ElementsIntoSet
    Set<String> nine() {
      return Collections.emptySet();
    }
  }

  Object anonymous() {
    return new Object() {
      @Provides
      @ElementsIntoSet
      Set<String> ten() {
        return Collections.emptySet();
      }
    };
  }
}

@Module
class S21EmptyNegative {
  @Provides
  @ElementsIntoSet
  Set<String> withParameter(String unused) {
    return Collections.emptySet();
  }

  @Provides
  @ElementsIntoSet
  Set<String> twoStatements() {
    int unused = 1;
    return Collections.emptySet();
  }

  @Provides
  @ElementsIntoSet
  Set<String> notEmpty() {
    return ImmutableSet.of("a");
  }

  @Provides
  Set<String> noElements() {
    return Collections.emptySet();
  }

  @ElementsIntoSet
  Set<String> noProvides() {
    return Collections.emptySet();
  }

  @Provides
  @ElementsIntoSet
  Set<String> copy() {
    return new HashSet<>(Collections.emptySet());
  }

  @Provides
  @ElementsIntoSet
  Set<String> parenthesized() {
    return (Collections.emptySet());
  }

  @Provides
  @ElementsIntoSet
  Set<String> anonymousSet() {
    return new HashSet<String>() {};
  }

  @SuppressWarnings("EmptySetMultibindingContributions")
  @Provides
  @ElementsIntoSet
  Set<String> suppressed() {
    return Collections.emptySet();
  }
}

@Module
record S21EmptyRecord(int x) {
  @Provides
  @ElementsIntoSet
  static Set<String> eleven() {
    return Collections.emptySet();
  }
}

@Module
class S21EmptyNested {
  @Module
  public static enum NestedEnum {
    A;

    @Provides
    @ElementsIntoSet
    static Set<String> twelve() {
      return Collections.emptySet();
    }
  }

  @Module
  private static final class NestedFinal {
    @Provides
    @ElementsIntoSet
    Set<String> thirteen() {
      return Collections.emptySet();
    }
  }

  @Module
  @interface NestedAnnotation {}

  void local() {
    @Module
    class Local {
      @Provides
      @ElementsIntoSet
      Set<String> fourteen() {
        return Collections.emptySet();
      }
    }
  }
}

@Module
enum S21EmptyConstantBody {
  A {
    @Provides
    @ElementsIntoSet
    Set<String> fifteen() {
      return Collections.emptySet();
    }
  };
}

@Module
@Deprecated
abstract class S21EmptyMore {
  @Provides
  @ElementsIntoSet
  @SuppressWarnings("unused")
  private static strictfp Set<String> sixteen() {
    return Collections.emptySet();
  }
}

@Module
interface S21EmptyIfaceMethods {
  @Provides
  @ElementsIntoSet
  default Set<String> seventeen() {
    return Collections.emptySet();
  }

  @Provides
  @ElementsIntoSet
  public static Set<String> eighteen() {
    return Collections.emptySet();
  }
}

@Module
sealed interface S21EmptySealed permits S21EmptySealedImpl, S21EmptyNonSealed {
  @Provides
  @ElementsIntoSet
  static Set<String> nineteen() {
    return Collections.emptySet();
  }
}

@Module
final class S21EmptySealedImpl implements S21EmptySealed {}

@Module
non-sealed class S21EmptyNonSealed implements S21EmptySealed {
  @Provides
  @ElementsIntoSet
  Set<String> twentyone() {
    return Collections.emptySet();
  }
}

@Module
class S21EmptyOrder {
  @Module
  static public abstract interface Both {
    @Provides
    @ElementsIntoSet
    static Set<String> twenty() {
      return Collections.emptySet();
    }
  }

  @Module
  protected strictfp final static class Many {
    @Provides
    @ElementsIntoSet
    Set<String> twentytwo() {
      return Collections.emptySet();
    }
  }

  @Module
  abstract static sealed class Base permits Sub {
    @Provides
    @ElementsIntoSet
    Set<String> twentythree() {
      return Collections.emptySet();
    }
  }

  static final class Sub extends Base {}
}
