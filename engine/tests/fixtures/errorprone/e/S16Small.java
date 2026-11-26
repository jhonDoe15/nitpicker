import com.google.auto.value.AutoValue;
import com.google.common.base.Splitter;
import com.google.common.cache.CacheLoader;
import com.google.common.truth.StringSubject;
import com.ibm.icu.lang.UCharacter;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.mockito.Mock;
import org.mockito.Mockito;

class S16Small {
  static final String DOT = ".";
  static final int FLAGS = Pattern.CASE_INSENSITIVE;

  @AutoValue
  abstract static class Value {
    abstract int x();
  }

  @AutoValue
  @interface NotReally {}

  @NotReally
  static class Meta {}

  static class Sub extends Value {
    int x() {
      return 1;
    }
  }

  interface Plain {}

  @Mock Value mockedField;
  @Mock Sub mockedSub;
  @Mock Plain mockedPlain;
  @Mock Meta mockedMeta;

  @SuppressWarnings("DoNotMockAutoValue")
  @Mock
  Value suppressedField;

  void mocks(Class<Value> cls) {
    Value one = Mockito.mock(Value.class);
    Sub two = Mockito.mock(Sub.class);
    Plain three = Mockito.mock(Plain.class);
    Value four = Mockito.spy(one);
    Mockito.mock(cls);
  }

  void loaders() {
    new CacheLoader<String, String>() {
      @Override
      public String load(String key) {
        return null;
      }
    };
    new CacheLoader<String, String>() {
      @Override
      public String load(String key) {
        return key.equals("") ? null : key;
      }
    };
    abstract class MyCacheLoader extends CacheLoader<String, String> {}
    new MyCacheLoader() {
      @Override
      public String load(String key) {
        return null;
      }
    };
    new CacheLoader<String, String>() {
      @Override
      @SuppressWarnings("CacheLoaderNull")
      public String load(String key) {
        return null;
      }
    };
    new CacheLoader<String, String>() {
      @Override
      public String load(String key) {
        Supplier<String> s =
            () -> {
              return null;
            };
        Supplier<String> t =
            new Supplier<String>() {
              public String get() {
                return null;
              }
            };
        return "";
      }
    };
  }

  void dots(String s, StringSubject subject) {
    s.split(".");
    s.split(".", 2);
    s.matches(DOT);
    s.replaceAll(".", "x");
    s.replaceFirst(".", "x");
    Pattern.compile(".");
    Pattern.compile(".", Pattern.CASE_INSENSITIVE);
    Pattern.compile(".", FLAGS);
    Pattern.matches(".", s);
    Splitter.onPattern(".");
    subject.matches(".");
    subject.doesNotMatch(".");
    subject.containsMatch(".");
    subject.doesNotContainMatch(".");
    s.split("\\.");
    s.split("..");
    Object r = s.split(".", -1);
    s.matches("." + "");
    Pattern.compile(s);
    Pattern.compile(".", s.length());
    s.contains(".");
    s.replace(".", "x");
    s.indexOf(".");
    subject.matches(1);
  }

  @SuppressWarnings("BareDotMetacharacter")
  void dotsSuppressed(String s) {
    s.split(".");
  }

  void numeric(char c, int cp) {
    Character.getNumericValue(c);
    Character.getNumericValue(cp);
    UCharacter.getNumericValue(cp);
    Character.digit(c, 10);
  }

  enum Color {
    RED {
      void f() {
        Class<?> k = getClass();
      }
    },
    GREEN;

    void g() {
      this.getClass();
      Class<?> c = getClass();
      getDeclaringClass();
    }
  }

  void enums(Color c, Enum<?> e, Object o) {
    c.getClass();
    e.getClass();
    o.getClass();
    Color.RED.getClass();
    System.out.println(c.getClass().getName());
    c.getDeclaringClass();
  }
}
