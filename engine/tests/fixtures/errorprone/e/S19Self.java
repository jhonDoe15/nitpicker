package e;

import com.google.protobuf.ByteString;

class S19Self {
  public static final class ReturnsThis {
    public ReturnsThis self() {
      return this;
    }
  }

  public static final class WithCast {
    public WithCast self() {
      return (WithCast) this;
    }
  }

  public static final class WithParens {
    public WithParens self() {
      return ((WithParens) (this));
    }
  }

  public static final class TryCatch {
    public TryCatch self() {
      try {
        return (TryCatch) this;
      } catch (ClassCastException e) {
        throw e;
      }
    }
  }

  public static final class Multiple {
    public Multiple self() {
      if (System.currentTimeMillis() % 2 == 0) {
        return this;
      } else {
        return this;
      }
    }
  }

  public static final class TwoStatements {
    public TwoStatements self() {
      TwoStatements self = (TwoStatements) this;
      return self;
    }
  }

  public static final class Reassigned {
    public Reassigned self() {
      Reassigned self = this;
      self = new Reassigned();
      return self;
    }
  }

  public static final class FinalLocal {
    public FinalLocal getThis() {
      final FinalLocal self = this;
      return self;
    }
  }

  public static final class Comment {
    public Comment self() {
      // this is an impl comment
      return /* self */ this;
    }
  }

  public static final class NewBuilder {
    public NewBuilder self() {
      return new NewBuilder();
    }
  }

  public static final class GetThisNew {
    public GetThisNew getThis() {
      return new GetThisNew();
    }
  }

  public static final class VoidReturn {
    public void self() {}
  }

  public static final class VoidClass {
    public Void self() {
      return null;
    }
  }

  public static final class DifferentType {
    public String self() {
      return "hi";
    }
  }

  public static final class Static {
    public static Static self() {
      return new Static();
    }
  }

  public static final class NotNamed {
    public NotNamed selfie() {
      return new NotNamed();
    }
  }

  public static final class HasParams {
    public HasParams self(int foo) {
      return new HasParams();
    }
  }

  public abstract static class Abstract {
    public abstract Abstract self();
  }

  public static final class Throws {
    public Throws self() {
      throw new UnsupportedOperationException();
    }
  }

  public static final class LambdaReturn {
    public LambdaReturn self() {
      Runnable r = () -> {};
      java.util.function.Supplier<Object> s = () -> new Object();
      return this;
    }
  }

  public static final class LocalClass {
    public LocalClass self() {
      class Inner {
        Object f() {
          return null;
        }
      }
      return this;
    }
  }

  public static final class AnonymousClass {
    public AnonymousClass self() {
      Object o = new Object() {
        Object f() {
          return null;
        }
      };
      return this;
    }
  }

  public static final class Qualified {
    public Qualified self() {
      return Qualified.this;
    }
  }

  public static final class OtherThis {
    final OtherThis other = new OtherThis();

    public OtherThis self() {
      return other;
    }
  }

  public static class Generic<T> {
    public Generic<T> self() {
      return this;
    }

    public Generic<T> getThis() {
      return new Generic<T>();
    }
  }

  public abstract static class Self<T extends Self<T>> {
    public T self() {
      return null;
    }

    public Self<T> getThis() {
      return null;
    }
  }

  interface Iface {
    default Iface self() {
      return null;
    }

    Iface getThis();
  }

  enum E {
    A;

    E self() {
      return A;
    }
  }

  record R(int x) {
    R self() {
      return new R(x);
    }
  }

  public static final class Resource implements AutoCloseable {
    public void close() {}

    public Resource self() {
      try (Resource c = (Resource) this) {
        return c;
      }
    }
  }

  public static final class SuppressedSelf {
    @SuppressWarnings("SelfAlwaysReturnsThis")
    public SuppressedSelf self() {
      return null;
    }
  }

  public static final class ThisInLoop {
    public ThisInLoop self() {
      for (int i = 0; i < 2; i++) {
        return this;
      }
      return null;
    }
  }

  public static final class InitThis {
    public InitThis self() {
      InitThis a = this, b = new InitThis();
      return b;
    }
  }

  public static final class LaterAssigned {
    public LaterAssigned self() {
      LaterAssigned a = this;
      Runnable r = () -> {};
      return a;
    }
  }

  private static final byte[] FOO_BYTES = new byte[10];
  private static final byte[] LITERAL_BYTES = {7, 7, 7};
  private static final byte[] TYPED_BYTES = new byte[] {7, 7, 7};
  private static final byte[] MIXED_BYTES = new byte[10];
  private static final byte[] ONLY_ONE, SECOND;
  private static final byte[] NOT_FINAL_USE = new byte[10];
  private final byte[] instanceBytes = new byte[3];
  byte[] notFinal = new byte[1];
  public static final byte[] EXPOSED = new byte[1];
  private static final byte[] UNUSED = new byte[1];
  private static final byte[] OFFSET = new byte[1];
  private static final byte[] TWO_USES = new byte[1];
  @SuppressWarnings("StronglyTypeByteString")
  private static final byte[] SUPPRESSED_BYTES = new byte[1];
  private static final Byte[] BOXED = new Byte[1];
  private static final int[] INTS = new int[1];

  static {
    ONLY_ONE = new byte[1];
    SECOND = new byte[1];
  }

  public ByteString get() {
    return ByteString.copyFrom(FOO_BYTES);
  }

  public ByteString literal() {
    return ByteString.copyFrom(LITERAL_BYTES);
  }

  public ByteString typed() {
    return ByteString.copyFrom(TYPED_BYTES);
  }

  public ByteString mixed() {
    return ByteString.copyFrom(MIXED_BYTES);
  }

  public byte[] mixedRaw() {
    return MIXED_BYTES;
  }

  public ByteString instance() {
    return ByteString.copyFrom(instanceBytes);
  }

  public ByteString notFinalUse() {
    return ByteString.copyFrom(notFinal);
  }

  public ByteString exposed() {
    return ByteString.copyFrom(EXPOSED);
  }

  public Object twice() {
    Object a = ByteString.copyFrom(TWO_USES);
    Object b = ByteString.copyFrom(S19Self.TWO_USES);
    return a;
  }

  public ByteString suppressed() {
    return ByteString.copyFrom(SUPPRESSED_BYTES);
  }

  public ByteString utf() {
    return ByteString.copyFromUtf8("x");
  }

  public ByteString offset() {
    return ByteString.copyFrom("a", "UTF-8");
  }

  public ByteString qualified() {
    return ByteString.copyFrom(S19Self.FOO_BYTES);
  }

  static class Multi {
    private static final byte[] M1 = new byte[1], M2 = {2};

    ByteString first() {
      return ByteString.copyFrom(M1);
    }

    ByteString second() {
      return ByteString.copyFrom(M2);
    }
  }

  static class Multi2 {
    private static final byte[] A = new byte[1]  ,  B = new byte[2] /* c */ ,C={3};
    private static final byte[] D = new byte[1]
        , E = new byte[2];

    ByteString first() {
      return ByteString.copyFrom(A);
    }

    ByteString second() {
      return ByteString.copyFrom(B);
    }

    ByteString third() {
      return ByteString.copyFrom(C);
    }

    ByteString d() {
      return ByteString.copyFrom(D);
    }

    ByteString e() {
      return ByteString.copyFrom(E);
    }
  }
}
