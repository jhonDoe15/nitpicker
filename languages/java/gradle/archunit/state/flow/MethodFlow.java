import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

final class MethodFlow {
  static final class Store {
    final Set<String> targets = new TreeSet<>();
    final Set<String> values = new TreeSet<>();
    final String op;

    Store(String op) {
      this.op = op;
    }
  }

  static final class Call {
    final String owner;
    final String name;
    final String desc;
    final boolean dispatch;
    final List<Set<String>> taint = new ArrayList<>();
    final List<Set<String>> alias = new ArrayList<>();

    Call(String owner, String name, String desc, boolean dispatch) {
      this.owner = owner;
      this.name = name;
      this.desc = desc;
      this.dispatch = dispatch;
    }

    void add(List<? extends Flow> arguments) {
      for (int index = 0; index < arguments.size(); index++) {
        if (taint.size() <= index) {
          taint.add(new TreeSet<>());
          alias.add(new TreeSet<>());
        }
        taint.get(index).addAll(arguments.get(index).taint);
        alias.get(index).addAll(arguments.get(index).alias);
      }
    }
  }

  static final class Feed {
    final Set<String> lambdas = new TreeSet<>();
    final Set<String> values = new TreeSet<>();
  }

  final String owner;
  final String name;
  final String desc;
  final boolean instance;
  final int arguments;
  final List<String> argumentNames;
  final Map<String, Store> stores = new TreeMap<>();
  final Map<Integer, Call> calls = new TreeMap<>();
  final Map<String, Call> lambdas = new TreeMap<>();
  final Map<Integer, Feed> feeds = new TreeMap<>();
  final Set<String> sources = new TreeSet<>();
  final Set<String> returns = new TreeSet<>();
  final Set<String> returnSources = new TreeSet<>();
  boolean holdsState;
  boolean setsUp;

  MethodFlow(String owner, String name, String desc, boolean instance, List<String> argumentNames) {
    this.owner = owner;
    this.name = name;
    this.desc = desc;
    this.instance = instance;
    this.arguments = argumentNames.size();
    this.argumentNames = argumentNames;
  }

  String key() {
    return owner + "." + name + desc;
  }

  void store(int index, String op, Set<String> targets, Set<String> values) {
    store(String.valueOf(index), op, targets, values);
  }

  void store(String key, String op, Set<String> targets, Set<String> values) {
    Store store = stores.computeIfAbsent(key, ignored -> new Store(op));
    store.targets.addAll(targets);
    store.values.addAll(values);
  }

  void call(int index, Call call, List<? extends Flow> arguments) {
    calls.computeIfAbsent(index, ignored -> call).add(arguments);
  }

  void lambda(String id, Call call, List<? extends Flow> captured) {
    lambdas.computeIfAbsent(id, ignored -> call).add(captured);
  }

  void feed(int index, Set<String> lambdaIds, Set<String> values) {
    Feed feed = feeds.computeIfAbsent(index, ignored -> new Feed());
    feed.lambdas.addAll(lambdaIds);
    feed.values.addAll(values);
  }
}
