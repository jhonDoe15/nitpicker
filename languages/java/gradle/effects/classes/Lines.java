package nitpicker.effects.classes;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.LineNumberNode;
import org.objectweb.asm.tree.MethodNode;

public final class Lines {
  private static final Pattern ENTRY = Pattern.compile("(\\d+)(?:#(\\d+))?(?:,(\\d+))?:(\\d+)(?:,(\\d+))?");
  private final Map<Integer, Integer> callSites = new HashMap<>();
  private final Map<Integer, Integer> own = new HashMap<>();
  private final boolean mapped;

  private Lines(String smap) {
    mapped = smap != null && smap.startsWith("SMAP");
    if (!mapped) {
      return;
    }
    String stratum = "";
    boolean lines = false;
    for (String raw : smap.split("\n")) {
      String line = raw.trim();
      if (line.startsWith("*S ")) {
        stratum = line.substring(3).trim();
        lines = false;
      } else if (line.startsWith("*")) {
        lines = line.equals("*L");
      } else if (lines) {
        read(line, stratum.equals("KotlinDebug") ? callSites : own, stratum.equals("KotlinDebug"));
      }
    }
  }

  public static Lines of(ClassNode node) {
    return new Lines(node.sourceDebug);
  }

  private static void read(String line, Map<Integer, Integer> target, boolean debug) {
    Matcher matcher = ENTRY.matcher(line);
    if (!matcher.matches()) {
      return;
    }
    int input = Integer.parseInt(matcher.group(1));
    int file = matcher.group(2) == null ? 1 : Integer.parseInt(matcher.group(2));
    int repeat = matcher.group(3) == null ? 1 : Integer.parseInt(matcher.group(3));
    int output = Integer.parseInt(matcher.group(4));
    int increment = matcher.group(5) == null ? 1 : Integer.parseInt(matcher.group(5));
    if (!debug && file != 1) {
      return;
    }
    for (int step = 0; step < repeat; step++) {
      for (int offset = 0; offset < Math.max(1, increment); offset++) {
        target.putIfAbsent(output + step * increment + offset, debug ? input : input + step);
      }
    }
  }

  public int source(int raw) {
    if (!mapped) {
      return raw;
    }
    Integer site = callSites.get(raw);
    if (site != null) {
      return site;
    }
    Integer mine = own.get(raw);
    return mine == null ? -1 : mine;
  }

  public int[] of(MethodNode method) {
    int[] result = new int[method.instructions.size()];
    int current = 0;
    int index = 0;
    for (AbstractInsnNode insn : method.instructions) {
      if (insn instanceof LineNumberNode number) {
        int line = source(number.line);
        current = line < 0 ? current : line;
      }
      result[index++] = current;
    }
    return result;
  }
}
