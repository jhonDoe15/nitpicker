import com.tngtech.archunit.core.domain.JavaClass;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

final class Summaries {
  private static final int ROUNDS = 64;

  private final Map<String, MethodFlow> flows;
  private final Map<String, JavaClass> classes;
  private final Map<String, Map<Integer, Reach>> summaries = new HashMap<>();
  private final Map<String, List<MethodFlow>> targets = new HashMap<>();

  Summaries(Map<String, MethodFlow> flows, Map<String, JavaClass> classes) {
    this.flows = flows;
    this.classes = classes;
    for (int round = 0; round < ROUNDS && settle(); round++) {
      continue;
    }
  }

  Reach reach(MethodFlow method, Set<String> initial) {
    Set<String> live = new HashSet<>(initial);
    Set<String> fed = new HashSet<>();
    while (spread(method, live, fed)) {
      continue;
    }
    Reach reach = new Reach();
    for (MethodFlow.Store store : method.stores.values()) {
      if (hits(store.values, live)) {
        store.targets.forEach(target -> classify(method, target, store.op, reach));
      }
    }
    for (MethodFlow.Call call : calls(method)) {
      for (int index = 0; index < call.taint.size(); index++) {
        if (hits(call.taint.get(index), live)) {
          apply(method, call, index, reach);
        }
      }
    }
    for (String id : fed) {
      MethodFlow.Call lambda = method.lambdas.get(id);
      for (int index = lambda.taint.size(); index < arguments(lambda); index++) {
        apply(method, lambda, index, reach);
      }
    }
    return reach;
  }

  private boolean settle() {
    boolean changed = false;
    for (MethodFlow method : flows.values()) {
      Map<Integer, Reach> summary = summaries.computeIfAbsent(method.key(), ignored -> new HashMap<>());
      for (int index = 0; index < method.arguments; index++) {
        Reach reach = reach(method, Set.of(Flow.ARG + index));
        if (!reach.equals(summary.get(index))) {
          summary.put(index, reach);
          changed = true;
        }
      }
    }
    return changed;
  }

  private boolean spread(MethodFlow method, Set<String> live, Set<String> fed) {
    boolean changed = false;
    for (MethodFlow.Store store : method.stores.values()) {
      if (hits(store.values, live)) {
        changed |= addCreated(store.targets, live);
      }
    }
    for (MethodFlow.Call call : calls(method)) {
      for (int index = 0; index < call.taint.size(); index++) {
        if (hits(call.taint.get(index), live)) {
          Reach callee = summaryOf(call, index);
          for (int retainer : callee.retains) {
            changed |= retainer < call.alias.size() && addCreated(call.alias.get(retainer), live);
          }
          if (localReceiver(call) && callee.sinks.stream().anyMatch(found -> found.onReceiver)) {
            changed |= addCreated(call.alias.get(0), live);
          }
        }
      }
    }
    for (MethodFlow.Feed feed : method.feeds.values()) {
      if (hits(feed.values, live)) {
        for (String id : feed.lambdas) {
          changed |= method.lambdas.containsKey(id) && fed.add(id);
        }
      }
    }
    return changed;
  }

  private void apply(MethodFlow method, MethodFlow.Call call, int index, Reach reach) {
    Reach callee = summaryOf(call, index);
    boolean local = localReceiver(call);
    boolean onSelf = !call.alias.isEmpty() && call.alias.get(0).contains(Flow.SELF);
    for (Reach.Sink found : callee.sinks) {
      if (!found.onReceiver) {
        reach.sinks.add(found);
      } else if (!local) {
        reach.sinks.add(new Reach.Sink(found.owner, found.field, found.op, onSelf));
      }
    }
    for (int retainer : callee.retains) {
      if (retainer < call.alias.size()) {
        call.alias.get(retainer).forEach(target -> classify(method, target, call.name, reach));
      }
    }
  }

  private static void classify(MethodFlow method, String target, String op, Reach reach) {
    if (target.startsWith(Flow.ARG)) {
      reach.retains.add(Integer.parseInt(target.substring(Flow.ARG.length())));
    } else if (target.startsWith(Flow.FIELD) && method.holdsState && !method.setsUp) {
      reach.sinks.add(new Reach.Sink(method.owner, target.substring(Flow.FIELD.length()), op, method.instance));
    } else if (target.startsWith(Flow.FIELD) && !method.holdsState && method.instance) {
      reach.retains.add(0);
    } else if (target.startsWith(Flow.STATIC) && !method.name.equals("<clinit>")) {
      reach.sinks.add(new Reach.Sink(method.owner, target.substring(Flow.STATIC.length()), op, false));
    }
  }

  private static boolean localReceiver(MethodFlow.Call call) {
    return !call.alias.isEmpty()
        && !call.alias.get(0).isEmpty()
        && call.alias.get(0).stream().allMatch(id -> id.startsWith(Flow.NEW));
  }

  private static boolean addCreated(Set<String> targets, Set<String> live) {
    boolean changed = false;
    for (String target : targets) {
      changed |= target.startsWith(Flow.NEW) && live.add(target);
    }
    return changed;
  }

  private static boolean hits(Set<String> values, Set<String> live) {
    return !Collections.disjoint(values, live);
  }

  private static List<MethodFlow.Call> calls(MethodFlow method) {
    List<MethodFlow.Call> calls = new ArrayList<>(method.calls.values());
    calls.addAll(method.lambdas.values());
    return calls;
  }

  private int arguments(MethodFlow.Call call) {
    return targetsOf(call).stream().mapToInt(target -> target.arguments).max().orElse(0);
  }

  private Reach summaryOf(MethodFlow.Call call, int index) {
    Reach merged = new Reach();
    for (MethodFlow target : targetsOf(call)) {
      Reach reach = summaries.getOrDefault(target.key(), Map.of()).get(index);
      if (reach != null) {
        merged.sinks.addAll(reach.sinks);
        merged.retains.addAll(reach.retains);
      }
    }
    return merged;
  }

  private List<MethodFlow> targetsOf(MethodFlow.Call call) {
    String key = call.owner + "." + call.name + call.desc + (call.dispatch ? "*" : "");
    return targets.computeIfAbsent(key, ignored -> resolve(call));
  }

  private List<MethodFlow> resolve(MethodFlow.Call call) {
    List<MethodFlow> found = new ArrayList<>();
    String signature = "." + call.name + call.desc;
    Optional<JavaClass> owner = Optional.ofNullable(classes.get(call.owner));
    Optional<JavaClass> current = owner;
    while (current.isPresent()) {
      MethodFlow declared = flows.get(internal(current.get()) + signature);
      if (declared != null) {
        found.add(declared);
        break;
      }
      current = current.get().getRawSuperclass().filter(type -> classes.containsKey(internal(type)));
    }
    if (call.dispatch && owner.isPresent()) {
      for (JavaClass subclass : owner.get().getAllSubclasses()) {
        MethodFlow declared = flows.get(internal(subclass) + signature);
        if (declared != null && !found.contains(declared)) {
          found.add(declared);
        }
      }
    }
    return found;
  }

  static String internal(JavaClass type) {
    return type.getName().replace('.', '/');
  }
}
