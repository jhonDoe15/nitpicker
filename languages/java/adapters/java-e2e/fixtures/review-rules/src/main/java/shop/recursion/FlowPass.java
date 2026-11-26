package shop.recursion;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class FlowPass {
  private FlowPass() {}

  public interface Block {
    List<Block> successors();

    Set<String> assigned();

    Set<String> read();
  }

  public static void solve(Block entry, Map<Block, Set<String>> input) {
    Deque<Block> work = new ArrayDeque<>();
    work.add(entry);
    while (!work.isEmpty()) {
      Block block = work.poll();
      Set<String> out = transfer(block, input.get(block));
      for (Block next : block.successors()) {
        if (input.get(next).addAll(out)) { // violation: ShrinkingWorklistJoin
          work.add(next);
        }
      }
    }
  }

  public static void growOnly(Block entry, Map<Block, Set<String>> input) {
    Deque<Block> work = new ArrayDeque<>();
    work.add(entry);
    while (!work.isEmpty()) {
      Block block = work.poll();
      Set<String> out = new HashSet<>(input.get(block));
      out.addAll(block.read());
      for (Block next : block.successors()) {
        if (input.get(next).addAll(out)) {
          work.add(next);
        }
      }
    }
  }

  public static void killGen(Block entry, Map<Block, Set<String>> input) {
    Deque<Block> work = new ArrayDeque<>();
    work.add(entry);
    while (!work.isEmpty()) {
      Block block = work.poll();
      Set<String> out = new HashSet<>(input.get(block));
      out.removeAll(block.assigned());
      out.addAll(block.read());
      for (Block next : block.successors()) {
        if (input.get(next).addAll(out)) {
          work.add(next);
        }
      }
    }
  }

  private static Set<String> transfer(Block block, Set<String> in) {
    Set<String> out = new HashSet<>(in);
    out.removeIf(fact -> block.assigned().contains(fact) && in.contains("maybe:" + fact));
    return out;
  }
}
