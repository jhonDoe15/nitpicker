import com.google.auto.value.AutoValue;
import com.google.auto.value.extension.memoized.Memoized;
import com.google.common.collect.BiMap;
import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.Multimap;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeMap;

class S16Auto {
  @AutoValue
  abstract static class Final {
    abstract String name();

    @Override
    public String toString() {
      return "x";
    }

    @Override
    public int hashCode() {
      return 1;
    }

    @Override
    public boolean equals(Object other) {
      return false;
    }
  }

  @AutoValue
  abstract static class OnlyOne {
    abstract String name();

    @Override
    public final String toString() {
      return "x";
    }

    @Override
    public boolean equals(Object other) {
      return false;
    }

    @Override
    public int hashCode() {
      return 1;
    }
  }

  @AutoValue
  abstract static class Skips {
    abstract String name();

    @Memoized
    @Override
    public String toString() {
      return "x";
    }

    int hashCode(int x) {
      return 1;
    }

    @Override
    protected void finalize() {}

    @SuppressWarnings("AutoValueFinalMethods")
    @Override
    public boolean equals(Object other) {
      return false;
    }
  }

  @AutoValue
  abstract static class AlreadyFinal {
    @Override
    public final String toString() {
      return "x";
    }

    @Override
    public abstract int hashCode();

    @Override
    public final boolean equals(Object other) {
      return false;
    }
  }

  abstract static class NotAutoValue {
    @Override
    public String toString() {
      return "x";
    }
  }

  @AutoValue
  abstract static class Immutable {
    abstract List<String> list();

    abstract ArrayList<String> arrayList();

    abstract LinkedList<String> linked();

    abstract Collection<String> collection();

    abstract String[] array();

    abstract int[] ints();

    abstract Map<String, String> map();

    abstract HashMap<String, String> hashMap();

    abstract LinkedHashMap<String, String> linkedHashMap();

    abstract TreeMap<String, String> treeMap();

    abstract Set<String> set();

    abstract HashSet<String> hashSet();

    abstract SortedSet<String> sortedSet();

    abstract BiMap<String, String> biMap();

    abstract Multimap<String, String> multimap();

    abstract ImmutableList<String> immutableList();

    abstract ImmutableMap<String, String> immutableMap();

    abstract String string();

    abstract Iterable<String> iterable();

    abstract java.util.List rawList();

    abstract java.util.List<String>[] arrayOfLists();

    @SuppressWarnings("AutoValueImmutableFields")
    abstract List<String> suppressed();

    @SuppressWarnings("mutable")
    abstract List<String> suppressedAlt();

    List<String> concrete() {
      return null;
    }

    abstract static class Builder {
      abstract List<String> inBuilder();
    }
  }

  @AutoValue
  interface Iface {
    List<String> list();

    abstract Map<String, String> map();

    @Override
    String toString();
  }

  @SuppressWarnings("mutable")
  @AutoValue
  abstract static class SuppressedClass {
    abstract List<String> list();
  }

  abstract static class Plain {
    abstract List<String> list();
  }
}
