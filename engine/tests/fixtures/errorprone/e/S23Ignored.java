package e;

import com.google.auto.value.AutoBuilder;
import com.google.auto.value.AutoValue;
import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.google.protobuf.ByteString;
import com.google.protobuf.MessageLite;
import io.reactivex.Completable;
import io.reactivex.Flowable;
import io.reactivex.Maybe;
import io.reactivex.Observable;
import io.reactivex.Single;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;

class S23Ignored {
  @AutoValue
  abstract static class Value {
    abstract String name();

    abstract int count();

    abstract int compute(int input);

    String concrete() {
      return "";
    }

    static Value create() {
      return null;
    }

    @AutoValue.Builder
    abstract static class Builder {
      abstract Builder setName(String name);

      abstract Value build();

      abstract String name();

      abstract Builder self();
    }
  }

  @AutoBuilder
  abstract static class Auto {
    abstract Auto setX(int x);

    abstract int x();

    abstract Auto copy();
  }

  abstract static class Proto implements MessageLite {
    abstract int getCount();

    Proto getSelf() {
      return this;
    }

    Proto() {}
  }

  static class Concrete implements MessageLite {
    @Override
    public ByteString toByteString() {
      return null;
    }

    @Override
    public MessageLite.Builder toBuilder() {
      return null;
    }
  }

  void getters(Value value, Value.Builder builder, Auto auto, Proto proto) {
    value.name();
    value.count();
    value.compute(1);
    value.concrete();
    Value.create().name();
    builder.setName("x");
    builder.name();
    builder.self();
    auto.setX(1);
    auto.x();
    auto.copy();
    proto.getCount();
    proto.getSelf();
    proto.getSelf().getCount();
    proto.toByteString();
    String s = value.name();
    Runnable r = () -> value.name();
    Runnable r2 = () -> {
      value.count();
    };
    for (value.count(); ; value.count()) {
      break;
    }
    Consumer<Value> viaReference = Value::name;
    Consumer<Value> viaReference2 = Value::concrete;
    Consumer<Proto> viaReference3 = Proto::getCount;
    new Concrete();
    new Concrete().toByteString();
    Object o = new Concrete();
    foo(value.name());
  }

  void foo(String s) {}

  @SuppressWarnings("IgnoredPureGetter")
  void suppressed(Value value) {
    value.name();
  }

  @CanIgnoreReturnValue
  Observable<String> ignorable() {
    return null;
  }

  Observable<String> observable() {
    return null;
  }

  Single<String> single() {
    return null;
  }

  Flowable<String> flowable() {
    return null;
  }

  Maybe<String> maybe() {
    return null;
  }

  Completable completable() {
    return null;
  }

  rx.Observable<String> rxObservable() {
    return null;
  }

  rx.Single<String> rxSingle() {
    return null;
  }

  rx.Completable rxCompletable() {
    return null;
  }

  static class Sub extends S23Ignored {
    @Override
    Observable<String> ignorable() {
      return null;
    }

    @Override
    Observable<String> observable() {
      return null;
    }
  }

  static class SubIgnorable extends S23Ignored {
    @Override
    @CanIgnoreReturnValue
    Observable<String> observable() {
      return null;
    }
  }

  void rx(Map<String, Observable<String>> map, HashMap<String, Single<String>> hash, Sub sub, SubIgnorable subIgnorable) {
    observable();
    single();
    flowable();
    maybe();
    completable();
    rxObservable();
    rxSingle();
    rxCompletable();
    ignorable();
    sub.ignorable();
    sub.observable();
    subIgnorable.observable();
    map.put("a", observable());
    hash.put("a", single());
    map.get("a");
    observable().map(x -> x);
    Observable.just(1);
    Single<String> kept = single();
    observable().subscribe();
    completable().andThen(completable());
    Completable.complete();
    Runnable r = () -> single();
  }

  @SuppressWarnings("RxReturnValueIgnored")
  void rxSuppressed() {
    observable();
  }
}
