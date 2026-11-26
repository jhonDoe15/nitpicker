package shop.recursion;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class DependencyWalks {
  private DependencyWalks() {}

  public interface Task {
    List<Task> getDependencies();

    Task getParent();
  }

  public static Set<Task> allDependencies(Task task) {
    Set<Task> all = new LinkedHashSet<>();
    for (Task next : task.getDependencies()) {
      all.add(next);
      all.addAll(allDependencies(next)); // violation: UnguardedCyclicRecursion
    }
    return all;
  }

  public static Throwable rootCause(Throwable error) {
    return error.getCause() == null ? error : rootCause(error.getCause()); // violation: UnguardedCyclicRecursion
  }

  public static long count(Task task) {
    return task.getDependencies().stream().mapToLong(dep -> count(dep)).sum(); // violation: UnguardedCyclicRecursion
  }

  public static int longestChain(Task task, int depth) {
    if (depth > 100) {
      throw new IllegalStateException("dependency chain too long or cyclic");
    }
    int longest = 0;
    for (Task next : task.getDependencies()) {
      longest = Math.max(longest, longestChain(next, depth + 1) + 1);
    }
    return longest;
  }

  public static int height(Task task) {
    return task.getParent() == null ? 0 : height(task.getParent()) + 1;
  }
}
