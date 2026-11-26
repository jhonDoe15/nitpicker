package shop.recursion;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class Reach {
  private Reach() {}

  public interface Value {
    List<Value> sources();

    List<Value> getChildren();
  }

  private record Step(Value value, int depth) {}

  public static int origins(Value start) {
    Deque<Step> pending = new ArrayDeque<>();
    pending.add(new Step(start, 0));
    int seen = 0;
    while (!pending.isEmpty()) { // violation: DepthOnlyWorklist
      Step step = pending.poll();
      seen++;
      if (step.depth() > 8) {
        continue;
      }
      for (Value source : step.value().sources()) {
        pending.add(new Step(source, step.depth() + 1));
      }
    }
    return seen;
  }

  public static int expandedOnce(Value start) {
    Set<Value> expanded = new HashSet<>();
    Deque<Step> pending = new ArrayDeque<>();
    pending.add(new Step(start, 0));
    while (!pending.isEmpty()) {
      Step step = pending.poll();
      if (step.depth() > 8 || !expanded.add(step.value())) {
        continue;
      }
      for (Value source : step.value().sources()) {
        pending.add(new Step(source, step.depth() + 1));
      }
    }
    return expanded.size();
  }

  public static int treeNodes(Value root) {
    Deque<Step> pending = new ArrayDeque<>();
    pending.add(new Step(root, 0));
    int count = 0;
    while (!pending.isEmpty()) {
      Step step = pending.poll();
      count++;
      if (step.depth() < 8) {
        for (Value child : step.value().getChildren()) {
          pending.add(new Step(child, step.depth() + 1));
        }
      }
    }
    return count;
  }
}
