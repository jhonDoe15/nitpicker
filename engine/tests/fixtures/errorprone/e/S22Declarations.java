import com.google.errorprone.BugPattern;
import com.google.errorprone.ErrorProneFlags;
import com.google.errorprone.bugpatterns.BugChecker;
import java.util.Iterator;
import javax.inject.Inject;

class S22Declarations {
  static class Comparing {
    public int compareTo(Comparing o) {
      return 0;
    }
  }

  static class ComparableOk implements Comparable<ComparableOk> {
    @Override
    public int compareTo(ComparableOk o) {
      return 0;
    }
  }

  abstract static class Base<T> implements Comparable<Base<T>> {}

  static class ViaSuper extends Base<String> {
    public int compareTo(Base<String> o) {
      return 0;
    }
  }

  static class ImproperObject {
    public int compareTo(Object o) {
      return 0;
    }
  }

  static class NotPublic {
    int compareTo(NotPublic o) {
      return 0;
    }
  }

  static class WrongReturn {
    public long compareTo(WrongReturn o) {
      return 0;
    }
  }

  static class TwoParameters {
    public int compareTo(TwoParameters o, int x) {
      return 0;
    }
  }

  interface Ordered {
    int compareTo(Ordered other);
  }

  static class Generic<T> {
    public int compareTo(Generic<T> other) {
      return 0;
    }
  }

  @SuppressWarnings("MissingImplementsComparable")
  static class Suppressed {
    public int compareTo(Suppressed o) {
      return 0;
    }
  }

  static class Node {}

  static class BadList implements Iterator<Node>, Iterable<Node> {
    public boolean hasNext() {
      return false;
    }

    public Node next() {
      return null;
    }

    public Iterator<Node> iterator() {
      return this;
    }
  }

  static class BadListInherited extends BadList {}

  static class GoodList implements Iterator<Node> {
    public boolean hasNext() {
      return false;
    }

    public Node next() {
      return null;
    }
  }

  static class ImplicitlyBad extends GoodList implements Iterable<Node> {
    public Iterator<Node> iterator() {
      return this;
    }
  }

  static class OnlyIterable implements Iterable<Node> {
    public Iterator<Node> iterator() {
      return null;
    }
  }

  interface BothInterface<T> extends Iterator<T>, Iterable<T> {}

  interface BothAgain<T> extends BothInterface<T> {}

  enum BothEnum implements Iterator<BothEnum>, Iterable<BothEnum> {
    A;

    public boolean hasNext() {
      return false;
    }

    public BothEnum next() {
      return null;
    }

    public Iterator<BothEnum> iterator() {
      return this;
    }
  }

  @SuppressWarnings("IterableAndIterator")
  static class SuppressedBoth implements Iterator<Node>, Iterable<Node> {
    public boolean hasNext() {
      return false;
    }

    public Node next() {
      return null;
    }

    public Iterator<Node> iterator() {
      return this;
    }
  }

  static class VarargsBase {
    void plain(String[] xs) {}

    void varargs(String... xs) {}

    void many(int a, String... xs) {}
  }

  static class VarargsSub extends VarargsBase {
    @Override
    void plain(String... xs) {}

    @Override
    void varargs(String[] xs) {}

    @Override
    void many(int a, String[] xs) {}
  }

  static class VarargsMulti extends VarargsBase {
    @Override
    void varargs(String[ ] xs) {}
  }

  static class VarargsNested extends VarargsBase {
    @Override
    void plain(String[] xs) {}
  }

  interface VarargsPlain {
    void run(Object[] xs);
  }

  interface VarargsDots {
    void run(Object... xs);
  }

  static class VarargsInconsistent implements VarargsPlain, VarargsDots {
    public void run(Object[] xs) {}
  }

  static class VarargsConsistent implements VarargsDots {
    public void run(Object... xs) {}
  }

  static class VarargsMatrix {
    void matrix(int[][] cells) {}
  }

  static class VarargsMatrixSub extends VarargsMatrix {
    @Override
    void matrix(int[]... cells) {}
  }

  static class VarargsSuppressed extends VarargsBase {
    @SuppressWarnings("Overrides")
    @Override
    void varargs(String[] xs) {}
  }

  @BugPattern(summary = "", severity = BugPattern.SeverityLevel.WARNING)
  public static class PatternChecker extends BugChecker {
    public PatternChecker(ErrorProneFlags flags) {}

    public PatternChecker(ErrorProneFlags first, ErrorProneFlags second) {}

    public PatternChecker() {}

    public PatternChecker(int count) {}

    public PatternChecker(ErrorProneFlags flags, int count) {}

    @Inject
    public PatternChecker(String name, ErrorProneFlags flags) {}
  }

  @BugPattern(summary = "", severity = BugPattern.SeverityLevel.WARNING)
  public static class InjectedChecker extends BugChecker {
    @Inject
    public InjectedChecker(ErrorProneFlags flags) {}
  }

  public static class NotPatternChecker extends BugChecker {
    public NotPatternChecker(ErrorProneFlags flags) {}
  }

  @BugPattern(summary = "", severity = BugPattern.SeverityLevel.WARNING)
  public static class SuppressedChecker extends BugChecker {
    @SuppressWarnings("InjectOnBugCheckers")
    public SuppressedChecker(ErrorProneFlags flags) {}
  }

  @BugPattern(summary = "", severity = BugPattern.SeverityLevel.WARNING)
  public static class SubChecker extends PatternChecker {
    SubChecker(ErrorProneFlags flags) {
      super(flags);
    }
  }

  static class GuiceBase {
    @com.google.inject.Inject
    void setUp(String name) {}

    @com.google.inject.Inject
    void other(String name) {}

    @javax.inject.Inject
    void javaxStyle(String name) {}

    void plain(String name) {}

    void names(String first, String second) {}

    void three(int a, int b, int c) {}

    void unrelated(int a, int b) {}

    void varargs(int a, int... b) {}
  }

  static class GuiceSub extends GuiceBase {
    @Override
    void setUp(String name) {}

    @com.google.inject.Inject
    @Override
    void other(String name) {}

    @Override
    void javaxStyle(String name) {}

    @Override
    void plain(String name) {}

    @Override
    void names(String second, String first) {}

    @Override
    void three(int c, int b, int a) {}

    @Override
    void unrelated(int x, int y) {}

    @Override
    void varargs(int b, int... a) {}
  }

  static class GuiceSubTwo extends GuiceBase {
    @Override
    void names(String second, String other) {}

    @Override
    void three(int b, int a, int d) {}

    @SuppressWarnings("OverridesGuiceInjectableMethod")
    @Override
    void other(String name) {}
  }

  static class GuiceSubInjected extends GuiceBase {
    @javax.inject.Inject
    @Override
    void setUp(String name) {}
  }
}
