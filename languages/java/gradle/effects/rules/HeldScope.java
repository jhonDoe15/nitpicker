package nitpicker.effects.rules;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.Report;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.scopes.Scopes;

public final class HeldScope {
  public static final String TRANSACTION = "RemoteCallInTransaction";
  public static final String LOCK = "RemoteCallUnderLock";
  private final Program program;
  private final Summaries summaries;
  private final Scopes scopes;
  private final Report report;

  public HeldScope(Program program, Summaries summaries, Scopes scopes, Report report) {
    this.program = program;
    this.summaries = summaries;
    this.scopes = scopes;
    this.report = report;
  }

  public void run() {
    for (Scopes.Scope scope : scopes.transactions()) {
      List<Call> sites = scopes.sites(scope).stream().filter(site -> !scopes.suspends(site)).toList();
      if (sites.stream().anyMatch(site -> path(site, Kinds.DATABASE) != null)) {
        report(TRANSACTION, scope, sites);
      }
    }
    for (Scopes.Scope scope : scopes.locks()) {
      report(LOCK, scope, scopes.sites(scope).stream().filter(site -> !scopes.fillOnce(scope, site)).toList());
    }
  }

  private void report(String rule, Scopes.Scope scope, List<Call> sites) {
    for (Call site : sites) {
      List<String> path = path(site, Kinds.REMOTE);
      if (path == null || (site.owner().equals(site.flow().owner.name) && program.anonymous(site.owner()))) {
        continue;
      }
      Map<String, Object> extra = new LinkedHashMap<>();
      extra.put("scope", scope.label());
      extra.put("holder", Report.methodName(scope.flow()));
      extra.put("path", path);
      String detail = Report.methodName(site.flow()) + "|" + scope.label() + "|" + String.join(">", path);
      report.add(rule, site.flow(), site.index(), detail, extra);
    }
  }

  private List<String> path(Call site, String kind) {
    return summaries.at(site).get(kind);
  }
}
