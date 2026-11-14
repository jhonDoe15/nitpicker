package nitpicker.effects.rules;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.Report;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.scopes.Scopes;
import nitpicker.effects.writes.Unsafe;

public final class RetryWrite {
  public static final String RULE = "RetryWithoutIdempotency";
  private static final List<String> ORDER = List.of(Unsafe.PAYMENT, Unsafe.INSERT, Unsafe.MESSAGE);
  private final Program program;
  private final Summaries writes;
  private final Scopes scopes;
  private final Report report;

  public RetryWrite(Program program, Scopes scopes, Report report) {
    this.program = program;
    this.writes = new Summaries(program, new Unsafe(program));
    this.scopes = scopes;
    this.report = report;
  }

  public void run() {
    writes.compute();
    for (Scopes.Scope scope : scopes.retries()) {
      for (Call call : scopes.sites(scope)) {
        if (call.owner().equals(call.flow().owner.name) && program.anonymous(call.owner())) {
          continue;
        }
        Map<String, List<String>> found = writes.at(call);
        for (String write : ORDER) {
          if (found.containsKey(write)) {
            report(scope, call, write, found.get(write));
            break;
          }
        }
      }
    }
  }

  private void report(Scopes.Scope scope, Call call, String write, List<String> path) {
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("scope", scope.label());
    extra.put("holder", Report.methodName(scope.flow()));
    extra.put("write", write);
    extra.put("path", path);
    String detail = Report.methodName(call.flow()) + "|" + scope.label() + "|" + String.join(">", path);
    report.add(RULE, call.flow(), call.index(), detail, extra);
  }
}
