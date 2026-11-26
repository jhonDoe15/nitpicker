package e;

import static java.io.InputStream.nullInputStream;
import static java.io.OutputStream.nullOutputStream;
import static java.io.Reader.nullReader;
import static java.io.Writer.nullWriter;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

import com.google.errorprone.annotations.MustBeClosed;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.ByteArrayOutputStream;
import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.util.function.Supplier;
import java.util.stream.Stream;
import java.util.zip.GZIPOutputStream;
import org.mockito.Mockito;

class S25MustBeClosed {



@SuppressWarnings({"UnusedNestedClass", "UnusedVariable"})
static class Pos {

  class DoesNotImplementAutoCloseable {
    @MustBeClosed
    // BUG: Diagnostic contains: MustBeClosed should only annotate constructors of AutoCloseables.
    DoesNotImplementAutoCloseable() {}

    @MustBeClosed
    // BUG: Diagnostic contains: MustBeClosed should only annotate methods that return an
    // AutoCloseable.
    void doesNotReturnAutoCloseable() {}
  }

  class Closeable implements AutoCloseable {

    @Override
    public void close() {}

    public int method() {
      return 1;
    }
  }

  class Foo {

    @MustBeClosed
    Closeable mustBeClosedAnnotatedMethod() {
      return new Closeable();
    }

    void sameClass() {
      // BUG: Diagnostic contains:
      mustBeClosedAnnotatedMethod();
    }
  }

  class MustBeClosedAnnotatedConstructor extends Closeable {

    @MustBeClosed
    MustBeClosedAnnotatedConstructor() {}

    void sameClass() {
      // BUG: Diagnostic contains:
      new MustBeClosedAnnotatedConstructor();
    }
  }

  void positiveCase1() {
    // BUG: Diagnostic contains:
    new Foo().mustBeClosedAnnotatedMethod();
  }

  void positiveCase2() {
    // BUG: Diagnostic contains:
    Closeable closeable = new Foo().mustBeClosedAnnotatedMethod();
  }

  void positiveCase3() {
    try {
      // BUG: Diagnostic contains:
      new Foo().mustBeClosedAnnotatedMethod();
    } finally {
    }
  }

  void positiveCase4() {
    try (Closeable c = new Foo().mustBeClosedAnnotatedMethod()) {
      // BUG: Diagnostic contains:
      new Foo().mustBeClosedAnnotatedMethod();
    }
  }

  void positiveCase5() {
    // BUG: Diagnostic contains:
    new MustBeClosedAnnotatedConstructor();
  }

  Closeable positiveCase6() {
    // BUG: Diagnostic contains:
    return new MustBeClosedAnnotatedConstructor();
  }

  Closeable positiveCase7() {
    // BUG: Diagnostic contains:
    return new Foo().mustBeClosedAnnotatedMethod();
  }

  int existingDeclarationUsesVar() {
    // BUG: Diagnostic contains:
    var result = new Foo().mustBeClosedAnnotatedMethod();
    return 0;
  }

  boolean twoCloseablesInOneExpression() {
    // BUG: Diagnostic contains:
    return new Foo().mustBeClosedAnnotatedMethod() == new Foo().mustBeClosedAnnotatedMethod();
  }

  void voidLambda() {
    // Lambda has a fixless finding because no reasonable fix can be suggested.
    // BUG: Diagnostic contains:
    Runnable runnable = () -> new Foo().mustBeClosedAnnotatedMethod();
  }

  void expressionLambda() {
    Supplier<Closeable> supplier =
        () ->
            // BUG: Diagnostic contains:
            new Foo().mustBeClosedAnnotatedMethod();
  }

  void statementLambda() {
    Supplier<Closeable> supplier =
        () -> {
          // BUG: Diagnostic contains:
          return new Foo().mustBeClosedAnnotatedMethod();
        };
  }

  void methodReference() {
    Supplier<Closeable> supplier =
        // TODO(b/218377318): BUG: Diagnostic contains:
        new Foo()::mustBeClosedAnnotatedMethod;
  }

  void anonymousClass() {
    new Foo() {
      @Override
      public Closeable mustBeClosedAnnotatedMethod() {
        // BUG: Diagnostic contains:
        return new MustBeClosedAnnotatedConstructor();
      }
    };
  }

  void subexpression() {
    // BUG: Diagnostic contains:
    new Foo().mustBeClosedAnnotatedMethod().method();
  }

  void ternary(boolean condition) {
    // BUG: Diagnostic contains:
    int result = condition ? new Foo().mustBeClosedAnnotatedMethod().method() : 0;
  }

  int variableDeclaration() {
    // BUG: Diagnostic contains:
    int result = new Foo().mustBeClosedAnnotatedMethod().method();
    return result;
  }

  void tryWithResources_nonFinal() {
    Foo foo = new Foo();
    // BUG: Diagnostic contains:
    Closeable closeable = foo.mustBeClosedAnnotatedMethod();
    try {
      closeable = null;
    } finally {
      closeable.close();
    }
  }

  void tryWithResources_noClose() {
    Foo foo = new Foo();
    // BUG: Diagnostic contains:
    Closeable closeable = foo.mustBeClosedAnnotatedMethod();
    try {
    } finally {
    }
  }

  class CloseableFoo implements AutoCloseable {

    @MustBeClosed
    CloseableFoo() {}

    // Doesn't autoclose Foo on Stream close.
    Stream<String> stream() {
      return null;
    }

    @Override
    public void close() {}
  }

  void twrStream() {
    // BUG: Diagnostic contains:
    try (Stream<String> stream = new CloseableFoo().stream()) {}
  }

  void constructorsTransitivelyRequiredAnnotation() {
    abstract class Parent implements AutoCloseable {
      @MustBeClosed
      Parent() {}

      // BUG: Diagnostic contains: Invoked constructor is marked @MustBeClosed
      Parent(int i) {
        this();
      }
    }

    // BUG: Diagnostic contains: Implicitly invoked constructor is marked @MustBeClosed
    abstract class ChildDefaultConstructor extends Parent {}

    abstract class ChildExplicitConstructor extends Parent {
      // BUG: Diagnostic contains: Invoked constructor is marked @MustBeClosed
      ChildExplicitConstructor() {}

      // BUG: Diagnostic contains: Invoked constructor is marked @MustBeClosed
      ChildExplicitConstructor(int a) {
        super();
      }
    }
  }

  @MustBeClosed
  OutputStream mustBeClosedOutputStream() {
    return nullOutputStream();
  }

  void decoratorConstructorThrows() throws IOException {
    // BUG: Diagnostic contains:
    try (var s = new GZIPOutputStream(mustBeClosedOutputStream())) {}
  }

  void notClosedByDecorator() throws IOException {
    class NotFilterOutputStream extends ByteArrayOutputStream {
      NotFilterOutputStream(OutputStream out) {}
    }
    // BUG: Diagnostic contains:
    try (var s = new NotFilterOutputStream(mustBeClosedOutputStream())) {}
  }

  OutputStream decoratorMustBeClosed() {
    class MustBeClosedFilter extends FilterOutputStream {
      @MustBeClosed
      MustBeClosedFilter(OutputStream out) {
        super(out);
      }
    }
    // BUG: Diagnostic contains:
    return new MustBeClosedFilter(
        // handled above
        mustBeClosedOutputStream());
  }
}




@SuppressWarnings({"UnnecessaryCast", "LambdaToMemberReference"})
static class Neg {

  class Closeable implements AutoCloseable {

    @Override
    public void close() {}
  }

  class Foo {

    void bar() {}

    @MustBeClosed
    Closeable mustBeClosedAnnotatedMethod() {
      return new Closeable();
    }
  }

  class MustBeClosedAnnotatedConstructor extends Closeable {

    @MustBeClosed
    MustBeClosedAnnotatedConstructor() {}
  }

  @SuppressWarnings("MustBeClosedChecker")
  void respectsSuppressWarnings_onMethod() {
    new Foo().mustBeClosedAnnotatedMethod();
  }

  void respectsSuppressWarnings_onLocal() {
    @SuppressWarnings("MustBeClosedChecker")
    var unused = new Foo().mustBeClosedAnnotatedMethod();
  }

  void negativeCase3() {
    try (Closeable closeable = new Foo().mustBeClosedAnnotatedMethod()) {}
  }

  void negativeCase4() {
    Foo foo = new Foo();
    try (Closeable closeable = foo.mustBeClosedAnnotatedMethod()) {}
  }

  void negativeCase5() {
    new Foo().bar();
  }

  void negativeCase6() {
    try (MustBeClosedAnnotatedConstructor foo = new MustBeClosedAnnotatedConstructor()) {}
  }

  void negativeCase7() {
    try (MustBeClosedAnnotatedConstructor foo = new MustBeClosedAnnotatedConstructor();
        Closeable closeable = new Foo().mustBeClosedAnnotatedMethod()) {}
  }

  @MustBeClosed
  Closeable positiveCase8() {
    // This is fine since the caller method is annotated.
    return new MustBeClosedAnnotatedConstructor();
  }

  @MustBeClosed
  Closeable positiveCase7() {
    // This is fine since the caller method is annotated.
    return new Foo().mustBeClosedAnnotatedMethod();
  }

  @MustBeClosed
  Closeable ternary(boolean condition) {
    return condition ? new Foo().mustBeClosedAnnotatedMethod() : null;
  }

  @MustBeClosed
  Closeable cast() {
    // TODO(b/241012760): remove the following line after the bug is fixed.
    // BUG: Diagnostic contains:
    return (Closeable) new Foo().mustBeClosedAnnotatedMethod();
  }

  void tryWithResources() {
    Foo foo = new Foo();
    Closeable closeable = foo.mustBeClosedAnnotatedMethod();
    try {
    } finally {
      closeable.close();
    }
  }

  void mockitoWhen(Foo mockFoo) {
    when(mockFoo.mustBeClosedAnnotatedMethod()).thenReturn(null);
    doReturn(null).when(mockFoo).mustBeClosedAnnotatedMethod();
  }

  void testException() {
    try {
      ((Foo) null).mustBeClosedAnnotatedMethod();
      fail();
    } catch (NullPointerException e) {
    }
  }

  abstract class ParentWithNoArgument implements AutoCloseable {
    @MustBeClosed
    ParentWithNoArgument() {}
  }

  abstract class ParentWithArgument implements AutoCloseable {
    @MustBeClosed
    ParentWithArgument(int i) {}
  }

  abstract class ChildOfParentWithArgument extends ParentWithArgument {
    @MustBeClosed
    ChildOfParentWithArgument() {
      super(0);
    }
  }

  interface ResourceFactory {
    @MustBeClosed
    MustBeClosedAnnotatedConstructor getResource();
  }

  void consumeCloseable(ResourceFactory factory) {
    try (Closeable c = factory.getResource()) {}
  }

  void expressionLambdaReturningCloseable() {
    consumeCloseable(() -> new MustBeClosedAnnotatedConstructor());
  }

  void statementLambdaReturningCloseable() {
    consumeCloseable(
        () -> {
          return new MustBeClosedAnnotatedConstructor();
        });
  }

  void methodReferenceReturningCloseable() {
    consumeCloseable(MustBeClosedAnnotatedConstructor::new);
  }

  void ternaryFunctionalExpressionReturningCloseable(boolean condition) {
    consumeCloseable(
        condition
            ? () -> new MustBeClosedAnnotatedConstructor()
            : MustBeClosedAnnotatedConstructor::new);
  }

  void inferredFunctionalExpressionReturningCloseable(ResourceFactory factory) {
    java.util.List.of(
            factory,
            () -> new MustBeClosedAnnotatedConstructor(),
            MustBeClosedAnnotatedConstructor::new)
        .forEach(this::consumeCloseable);
  }

  @MustBeClosed
  <C extends AutoCloseable> C mustBeClosed(C c) {
    return c;
  }

  void closedByDecorator() throws IOException {
    try (var in = new BufferedInputStream(mustBeClosed(nullInputStream()))) {}
    try (var out = new BufferedOutputStream(mustBeClosed(nullOutputStream()))) {}

    try (var in = new BufferedInputStream(mustBeClosed(nullInputStream()), 1024)) {}
    try (var out = new BufferedOutputStream(mustBeClosed(nullOutputStream()), 1024)) {}

    try (var r = new InputStreamReader(mustBeClosed(nullInputStream()))) {}
    try (var w = new OutputStreamWriter(mustBeClosed(nullOutputStream()))) {}

    try (var r = new BufferedReader(mustBeClosed(nullReader()))) {}
    try (var w = new BufferedWriter(mustBeClosed(nullWriter()))) {}
  }
}


  static class Enumerated {
    enum Test {
      A;

      interface Foo extends java.io.Closeable {}

      @MustBeClosed
      static Foo createResource() {
        return null;
      }

      private final Foo resource;
      private final Foo resource2 = createResource();

      Test() {
        this.resource = createResource();
      }
    }
  }

  static class Loops {
    class Closeable implements AutoCloseable {
      @Override
      public void close() {}

      public int method() {
        return 1;
      }
    }

    class Foo {
      @MustBeClosed
      Closeable mustBeClosedMethod() {
        return null;
      }
    }

    void forLoopCondition() {
      for (int i = 0; i < new Foo().mustBeClosedMethod().method(); ++i) {}
    }

    void inferred(Foo foo) {
      var bar = foo.mustBeClosedMethod().method();
    }
  }

  static class Extra {
    static class Res implements AutoCloseable {
      @MustBeClosed
      Res() {}

      @MustBeClosed
      Res(int i) {}

      @Override
      public void close() {}

      Stream<String> lines() {
        return null;
      }
    }

    static class SubDefault extends Res {}

    static class SubExplicit extends Res {
      SubExplicit(String s, int x) {}

      SubExplicit(int i, int j) {
        super(i);
      }

      SubExplicit(String s) {
        this(s, 1);
      }

      @MustBeClosed
      SubExplicit(long l) {}
    }

    Res field;

    static final Res CONSTANT = null;

    void anonymous() {
      Object o = new Res() {};
    }

    void anonymousResource() {
      try (Res r = new Res() {}) {}
    }

    @SuppressWarnings("MustBeClosed")
    void altName() {
      new Res();
    }

    @SuppressWarnings("MustBeClosedChecker")
    void ownName() {
      new Res();
    }

    @SuppressWarnings("all")
    void everything() {
      new Res();
    }

    void suppressedLocal() {
      @SuppressWarnings("MustBeClosed")
      Res r = new Res();
      Res q = new Res(1);
    }

    void inAnonymousClass() {
      new Object() {
        Res r = new Res();
      };
    }

    static final Object HOLDER =
        new Object() {
          void m() {
            new Res();
          }
        };

    static final java.util.function.Supplier<Res> SUPPLIER = () -> new Res();

    void closedInFinally() {
      Res r = new Res();
      try {
      } finally {
        r.close();
      }
    }

    void effectivelyFinalNotClosed() {
      Res r = new Res();
      try {
      } finally {
        field.close();
      }
    }

    void streamChain() {
      new Res().lines().filter(x -> true).count();
      Stream<String> s = new Res().lines().filter(x -> true);
    }

    void mockito(Res mock) {
      Mockito.when(new Res()).thenReturn(null);
      Mockito.verify(mock).lines();
    }

    void arguments(Object a, Object b) {
      arguments(new Res(), new Res(1));
    }

    void conditionAndLoops(boolean b) {
      if (new Res().lines() == null) {}
      while (new Res(1).lines() == null) {}
      do {} while (new Res(2).lines() == null);
    }

    void assigned() {
      field = new Res();
      Res local;
      local = new Res(1);
    }

    void arrays() {
      Res[] rs = {new Res()};
      Res[] more = new Res[] {new Res(1)};
    }

    void ternaryTarget(boolean b) {
      Res r = b ? new Res() : null;
      Object o = b ? null : new Res(1);
      Object p = (b ? new Res() : null);
    }

    void thrown() throws Exception {
      throw new Exception(String.valueOf(new Res()));
    }

    void switched(int i) {
      switch (i) {
        case 1:
          new Res();
          break;
        default:
          Res d = new Res(2);
      }
    }

    void labelled() {
      label:
      new Res();
    }

    void resourceChain() throws Exception {
      try (Res a = new Res();
          Res b = new Res(1)) {
        new Res(3);
      }
    }

    void twoSameName() {
      new Res();
      new Res(1);
      Res res = new Res(2);
      for (Res x = new Res(3); ; ) {}
    }

    void lambdaBlock() {
      Runnable r = () -> {
        new Res();
      };
      java.util.function.Supplier<Res> s = () -> {
        Res q = new Res();
        return q;
      };
    }

    Res returned(boolean b) {
      if (b) {
        return new Res();
      }
      return (new Res(1));
    }

    @MustBeClosed
    Res annotatedReturn() {
      return new Res();
    }

    Object parens() {
      return ((new Res()));
    }

    void expected() {
      try {
        new Res();
        org.junit.Assert.fail();
      } catch (RuntimeException e) {
      }
    }

    void typeArguments() {
      var list = java.util.List.of(new Res());
      java.util.List<Res> typed = java.util.List.of(new Res(1));
    }

    void shadowedNames() {
      Object closeable = null;
      new Res().lines();
      new Res(1).lines();
    }
  }

  static class More {
    static class URLRes implements AutoCloseable {
      @MustBeClosed
      URLRes() {}

      @Override
      public void close() {}

      java.util.List<String> names() {
        return null;
      }

      int[] numbers() {
        return null;
      }
    }

    @MustBeClosed
    static <C extends AutoCloseable> C open(C c) {
      return c;
    }

    @MustBeClosed
    static <C extends java.io.Closeable> java.util.List<C> openAll(C c) {
      return null;
    }

    void camel() {
      new URLRes();
    }

    void generic() throws Exception {
      open(new java.io.StringReader("x"));
    }

    void generics() {
      openAll(new java.io.StringReader("x"));
    }

    void iterate() {
      for (String s : new URLRes().names()) {}
      for (int n : new URLRes().numbers()) {}
    }

    void declarations() {
      final java.util.List<String> a = new URLRes().names();
      var b = new URLRes().names();
      int[] c = new URLRes().numbers();
      String d = new URLRes().names().get(0);
      var e = new URLRes().numbers()[0];
    }

    void locked(Object lock) {
      synchronized (new URLRes().names()) {}
      assert new URLRes().names() != null;
    }

    int yielded(int i) {
      return switch (i) {
        case 1 -> new URLRes().numbers().length;
        default -> {
          yield new URLRes().names().size();
        }
      };
    }

    void nestedLambda() {
      java.util.function.Supplier<Object> s = () -> new URLRes().names();
      java.util.function.Function<Object, Object> f = x -> {
        return new URLRes().names();
      };
    }

    static {
      new URLRes();
    }

    java.util.function.Supplier<Object> field = () -> new URLRes().names();
  }

  static class Switches {
    static class R implements AutoCloseable {
      @MustBeClosed
      R() {}

      @Override
      public void close() {}

      int size() {
        return 0;
      }
    }

    void statementRule(int i) {
      switch (i) {
        case 1 -> new R();
        default -> {}
      }
    }

    void statementRuleNested(int i) {
      switch (i) {
        case 1 -> System.out.println(new R().size());
        default -> {}
      }
    }

    Object expressionDirect(int i) {
      Object o = switch (i) {
        case 1 -> new R();
        default -> null;
      };
      return o;
    }

    int expressionNested(int i) {
      int o = switch (i) {
        case 1 -> new R().size();
        default -> 0;
      };
      return o;
    }

    int expressionBlock(int i) {
      return switch (i) {
        case 1 -> {
          int q = new R().size();
          yield q;
        }
        default -> throw new IllegalStateException(String.valueOf(new R()));
      };
    }
  }
}
