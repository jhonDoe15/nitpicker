import com.google.common.collect.Multimap;
import com.google.common.collect.Multiset;
import com.google.common.collect.SetMultimap;
import com.google.errorprone.refaster.annotation.AfterTemplate;
import com.google.errorprone.refaster.annotation.BeforeTemplate;
import com.google.errorprone.refaster.annotation.Placeholder;
import com.google.protobuf.AbstractMessageLite;
import com.google.protobuf.Internal;
import com.google.protobuf.ProtocolMessageEnum;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import javax.annotation.processing.Generated;

class S18Misc {
  static final Object LOCK = new Object();

  static {
    synchronized (String.class) {
    }
    synchronized (S18Misc.class) {
    }
  }

  void locks() {
    synchronized (String.class) {
    }
    synchronized ((Integer.class)) {
    }
    synchronized (S18Misc.class) {
    }
    synchronized (this) {
    }
    synchronized (LOCK) {
    }
    Runnable r = new Runnable() {
      public void run() {
        synchronized (S18Misc.class) {
        }
      }
    };
    Runnable lambda = () -> {
      synchronized (S18Misc.class) {
      }
    };
  }

  class SubClass {
    void locks() {
      synchronized (S18Misc.class) {
      }
      synchronized (SubClass.class) {
      }
      synchronized (S18Misc.SubClass.class) {
      }
    }
  }

  @SuppressWarnings("LockOnNonEnclosingClassLiteral")
  void suppressedLock() {
    synchronized (String.class) {
    }
  }

  static final class MethodLacksBeforeTemplateAnnotation {
    @BeforeTemplate
    boolean before1(String string) {
      return string.equals("");
    }

    boolean before2(String string) {
      return string.length() == 0;
    }

    @AfterTemplate
    boolean after(String string) {
      return string.isEmpty();
    }
  }

  static final class MethodLacksAfterTemplateAnnotation {
    @BeforeTemplate
    boolean before(String string) {
      return string.equals("");
    }

    boolean after(String string) {
      return string.isEmpty();
    }
  }

  abstract static class MethodLacksPlaceholderAnnotation<K, V> {
    abstract V function(K key);

    @BeforeTemplate
    void before(Map<K, V> map, K key) {
      if (!map.containsKey(key)) {
        map.put(key, function(key));
      }
    }

    @AfterTemplate
    void after(Map<K, V> map, K key) {
      map.computeIfAbsent(key, k -> function(k));
    }
  }

  static final class ValidRefasterTemplate {
    @BeforeTemplate
    void unusedPureFunctionCall(Object o) {
      o.toString();
    }
  }

  static final class ConstructorLacksAnnotation {
    ConstructorLacksAnnotation() {}

    @BeforeTemplate
    void before() {}
  }

  static final class DefaultConstructorOnly {
    @Placeholder
    abstract static class Inner {}

    @AfterTemplate
    void after() {}
  }

  static final class NotARefasterTemplate {
    @Override
    public String toString() {
      return "This is not a Refaster template";
    }

    void other() {}
  }

  @SuppressWarnings("MissingRefasterAnnotation")
  static final class SuppressedTemplate {
    @BeforeTemplate
    void before() {}

    void after() {}
  }

  interface InterfaceTemplate {
    @BeforeTemplate
    void before();

    void after();
  }

  Object anonymousTemplate = new Object() {
    @BeforeTemplate
    void before() {}

    void after() {}
  };

  void multimapKeys(Multimap<String, String> m, SetMultimap<String, String> sm, Collection<String> c) {
    for (String k : m.keys()) {}
    for (String k : sm.keys()) {}
    m.keys().forEach(x -> {});
    Multiset<String> keys = m.keys();
    int size = m.keys().size();
    for (String k : m.keySet()) {}
    for (String k : c) {}
    for (String k : (m.keys())) {}
    m.keys().stream().forEach(x -> {});
    consume(m.keys());
  }

  @SuppressWarnings("MultimapKeys")
  void suppressedKeys(Multimap<String, String> m) {
    for (String k : m.keys()) {}
  }

  void consume(Object o) {}

  public String hello(Stream<?> st) {
    return "";
  }

  public void basicCaseParallel(List<String> list) {
    list.stream().parallel().parallel();
  }

  public void basicCaseParallelNotFirst(List<String> list) {
    list.stream().map(m -> m).parallel().parallel();
  }

  public void basicCollection(Collection<String> list) {
    list.stream().parallel().parallel();
  }

  public void parallelStream(List<String> list) {
    list.parallelStream().parallel().parallel();
  }

  public void basicCaseParallelThisInMethodArg(List<String> list) {
    this.hello(list.stream().parallel().parallel());
  }

  public void onlyOneError(List<String> list) {
    this.hello(
        list.stream().parallel().parallel());
  }

  public void mapMethod(List<String> list) {
    hello(list.stream().map(m -> this.hello(null)).parallel().parallel());
  }

  public void betweenMethods(List<String> list) {
    list.stream().parallel().map(m -> m.toString()).parallel();
  }

  public void basicCaseParallelNotLast(List<String> list) {
    list.stream().parallel().map(m -> m.toString()).parallel().findFirst();
  }

  public void basicCaseSequential(List<String> list) {
    list.stream().sequential().map(m -> m.toString()).sequential();
  }

  public void bothSequentialAndParallel(List<String> list) {
    list.stream().sequential().parallel().sequential();
  }

  public void bothSequentialAndParallelMultiple(List<String> list) {
    list.stream().sequential().parallel().sequential().parallel();
  }

  public void parallelMultipleLines(List<String> list) {
    list.stream().parallel().map(m -> m.toString()).parallel();
  }

  public void multipleParallelCalls(List<String> list) {
    list.parallelStream().sequential();
  }

  public void streamWithinAStream(List<String> list, List<String> list2) {
    list.stream()
        .flatMap(childDir -> list2.stream())
        .parallel()
        .flatMap(a -> list2.stream())
        .parallel();
  }

  public void streamWithinAStreamImmediatelyAfterOtherParallel(List<String> list, List<String> list2) {
    list.stream().parallel().map(m -> list2.stream().parallel()).parallel();
  }

  public void parallelAndNestedStreams(List<String> list, List<String> list2) {
    list.parallelStream()
        .flatMap(childDir -> list2.stream())
        .parallel()
        .filter(m -> (new Holder("test")).test())
        .map(
            a -> {
              if (a == null) {
                return a;
              }
              return null;
            })
        .filter(a -> a != null)
        .flatMap(a -> list2.stream())
        .parallel();
  }

  public void negativeParallel(List<String> list) {
    list.stream().parallel();
    list.stream().sequential();
    list.stream().parallel().findFirst();
    list.stream().map(m -> m).parallel().filter(m -> m.isEmpty());
    SomeObject someObject = new SomeObject();
    someObject.parallel().parallel();
    list.stream().filter(m -> m.isEmpty()).findFirst();
    list.stream().map(m -> list.stream().parallel()).parallel();
    list.stream().parallel().map(m -> list.stream().parallel());
    list.stream().sequential().map(m -> list.stream().parallel()).parallel();
  }

  @SuppressWarnings("MultipleParallelOrSequentialCalls")
  void suppressedParallel(List<String> list) {
    list.stream().parallel().parallel();
  }

  class SomeObject {
    public SomeObject parallel() {
      return null;
    }
  }

  private class Holder {
    public Holder(String con) {}

    private boolean test() {
      return true;
    }
  }

  static class exports {}

  static class to {}

  interface with {}

  enum open {
    A
  }

  static class transitive<T> {}

  @SuppressWarnings("NamedLikeContextualKeyword")
  static class module {}

  static class Yields {
    void yield() {}

    static void yield(int i) {}

    void other() {}
  }

  interface Yielder {
    void yield();
  }

  static class YielderImpl implements Yielder {
    @Override
    public void yield() {}
  }

  static class YielderImpl2 implements Yielder {
    public void yield() {}

    public void yield(int x) {}
  }

  @Generated("com.google.auto.value.processor.AutoValueProcessor")
  static class Generated1 {
    void yield() {}
  }

  @Generated("other.Processor")
  static class Generated2 {
    void yield() {}
  }

  enum Lite implements Internal.EnumLite {
    FOO;

    @Override
    public int getNumber() {
      return 0;
    }

    static Lite forNumber(int number) {
      return FOO;
    }
  }

  enum Proto implements Internal.EnumLite, ProtocolMessageEnum {
    BAR;

    @Override
    public int getNumber() {
      return 0;
    }
  }

  enum OneOf implements Internal.EnumLite, AbstractMessageLite.InternalOneOfEnum {
    BAZ;

    @Override
    public int getNumber() {
      return 0;
    }
  }

  void liteEnums() {
    Lite.valueOf("FOO");
    Lite.FOO.valueOf("FOO");
    Lite.forNumber(0);
    Proto.valueOf("BAR");
    OneOf.valueOf("BAZ");
    Thread.State.valueOf("NEW");
  }

  @SuppressWarnings("LiteEnumValueOf")
  void suppressedLite() {
    Lite.valueOf("FOO");
  }

  @Generated("com.ryanharter.auto.value.parcel.AutoValueParcelExtension")
  static class AutoValue_TestData {
    void test() {
      Lite.valueOf("FOO");
    }

    class Nested {
      void test() {
        Lite.valueOf("FOO");
      }
    }
  }

  @Generated("some.other.Generator")
  static class FakeGenerated {
    void test() {
      Lite.valueOf("FOO");
    }
  }
}
