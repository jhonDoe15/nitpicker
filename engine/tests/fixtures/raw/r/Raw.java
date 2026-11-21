package r;

import java.io.Closeable;
import java.io.Flushable;
import java.util.AbstractList;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

interface Serde<T> extends Closeable { Reader<T> reader(); Plain plain(); T value(); }
interface Reader<T> extends Closeable {}
interface Plain extends Closeable { Plain self(); }
interface Outer<T> extends Closeable {}
interface Inner<T> extends Outer<T> {}
interface ThroughRaw extends Serde {}
interface RawFirst extends Serde, Closeable {}
interface PlainFirst extends Closeable, Serde {}
interface Written extends Serde<String> {}
class RawList extends ArrayList {}
class Sub extends RawList implements Flushable { public void flush() {} }
abstract class Num<T> extends Number implements Cloneable, Runnable, Comparable<Num<T>>, CharSequence {}
abstract class Items<T> extends AbstractList<T> {}
abstract class RawItems extends Items { void inside() { Raw.same(get(0)); Raw.same(iterator()); Raw.same(this); } }
class Circular<B extends Circular<B>> implements Runnable { public void run() {} B self() { return null; } }
class Bounded<B extends Runnable> implements Runnable { public void run() {} }
class Worker<T> extends Thread { void work() throws InterruptedException { Thread.sleep(1); join(1); Raw.same(this); } }

class Holder<T> implements Closeable {
    public void close() {}
    class In { void use() { Raw.same(Holder.this); Holder.this.close(); } }
}
class Left<T> extends Holder<T> {}
class Right<T> extends Holder<T> {}
class Choice {
    void pick(boolean first, Left raw) {
        Raw.same(first ? new Left<String>() : new Right<String>());
        Raw.same(new Holder<>() { });
        Raw.same(new Holder<String>() { });
        Raw.same(new Holder() { });
    }
}
public class Raw<V extends Serde, W extends Serde<String>, N extends Number> {
    V field;
    static <T> T load(String name, Class<T> base) { return null; }
    static <T> T same(T value) { return null; }

    void values(Serde raw, Serde<String> typed, Inner inner, ThroughRaw through, RawFirst rawFirst, PlainFirst plainFirst, Written written,
            RawList list, Sub sub, V v, W w, Serde[] array, Map<String, Serde> map, List<? extends Serde> wild, Object any) {
        same(raw);
        same(typed);
        same(inner);
        same(through);
        same(rawFirst);
        same(plainFirst);
        same(written);
        same(list);
        same(sub);
        same(w);
        same(array[0]);
        same(map.get(""));
        same((Serde) any);
        raw.plain();
        raw.value();
        raw.reader();
        typed.reader();
        through.reader();
        load("", Serde.class);
        load("", Serde.class).reader();
        load("", Plain.class);
        load("", ArrayList.class);
    }

    <T extends Num<?>, K extends Comparable<K> & Runnable, B extends Circular<B>> void more(Num raw, Num<String> typed, T t, K k, RawItems items,
            B b, Circular<?> wild, Circular bare, List<String> strings) {
        same(raw);
        same(typed);
        same(t);
        same(k);
        same(items);
        same(items.iterator());
        same(b);
        same(b.self());
        same(wild.self());
        same(bare.self());
        same(new Circular());
        same(new Circular<>());
        same(new Bounded<>());
        same(new HashMap());
        same(new HashMap<>());
        same(new ArrayList());
        same(new ArrayList<>());
        same(new ArrayList<String>());
        same(new ArrayList<>(strings));
        same(Collections.emptyList());
        same(new Num[0]);
        String.valueOf(new Circular<>());
    }

    <R, Q extends Number> R[] variables(R[] a, V v, List<R> l, Q q, N n) {
        R r = (R) v;
        V[] vs = (V[]) a;
        Object first = (N) n;
        Object second = (Q) n;
        Object third = (Object) n;
        return (R[]) a;
    }
}
