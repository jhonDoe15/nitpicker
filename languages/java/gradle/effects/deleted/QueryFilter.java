package nitpicker.effects.deleted;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.Report;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.tree.MethodInsnNode;

public final class QueryFilter {
  public static final String RULE = "SoftDeleteFilterMissing";
  public static final int MIN_READS = 5;
  public static final int SHARE = 80;
  private final Program program;
  private final SoftDelete soft;
  private final Report report;

  public QueryFilter(Program program, SoftDelete soft, Report report) {
    this.program = program;
    this.soft = soft;
    this.report = report;
  }

  public void run() {
    QueryReads source = new QueryReads(program, soft);
    List<QueryReads.Read> all = new ArrayList<>(source.declared());
    all.addAll(source.inline());
    Map<String, int[]> counts = new HashMap<>();
    for (QueryReads.Read read : all) {
      int[] count = counts.computeIfAbsent(read.entity(), key -> new int[2]);
      count[0]++;
      count[1] += filtered(read) ? 1 : 0;
    }
    for (QueryReads.Read read : all) {
      int[] count = counts.get(read.entity());
      if (filtered(read) || !majority(count)) {
        continue;
      }
      if (read.flow() != null) {
        add(read, count, read.flow(), read.index());
      } else {
        callsOf(read, count);
      }
    }
  }

  private void callsOf(QueryReads.Read read, int[] count) {
    for (MethodFlow flow : program.all()) {
      for (int index = 0; index < flow.insns.length; index++) {
        if (flow.insns[index] instanceof MethodInsnNode call && call.name.equals(read.name())
            && call.desc.equals(read.desc()) && program.index.isSubtype(call.owner, read.declaring())) {
          add(read, count, flow, index);
        }
      }
    }
  }

  private boolean filtered(QueryReads.Read read) {
    return soft.of(read.entity()).stream().anyMatch(flag -> flag.mentionedIn(read.text()));
  }

  private static boolean majority(int[] count) {
    return count[0] >= MIN_READS && count[1] * 100 >= count[0] * SHARE;
  }

  private void add(QueryReads.Read read, int[] count, MethodFlow flow, int index) {
    SoftDelete.Flag flag = soft.of(read.entity()).get(0);
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("entity", SoftDelete.simple(read.entity()));
    extra.put("column", flag.property());
    extra.put("read", read.label());
    extra.put("filtered", count[1]);
    extra.put("total", count[0]);
    report.add(RULE, flow, index, Report.methodName(flow) + "|" + SoftDelete.simple(read.entity()) + "|"
        + read.label(), extra);
  }
}
