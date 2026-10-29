package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.*;
import nitpicker.kotlinpsi.common.Json;
import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.psi.KtFile;
import org.jetbrains.kotlin.psi.KtImportDirective;

final class State {
  final boolean test;
  final boolean locators;
  final List<Object> classes = new ArrayList<>();
  final List<Object> functions = new ArrayList<>();
  final List<Object> properties = new ArrayList<>();
  final List<Object> waits = new ArrayList<>();
  final List<Object> predicates = new ArrayList<>();
  final List<Object> lookups = new ArrayList<>();
  final List<Object> typed = new ArrayList<>();
  final Set<String> calls = new LinkedHashSet<>();
  final Set<String> references = new LinkedHashSet<>();
  final List<Object> typeAliases = new ArrayList<>();
  private static final List<String> LOCATOR_PACKAGES =
      List.of(
          "org.koin.", "com.google.inject.", "jakarta.enterprise.", "javax.enterprise.", "javax.naming.",
          "org.springframework.jndi.");
  private final KtFile file;
  private final String relative;
  private final Lines lines;
  private final Map<String, String> waitImports = new HashMap<>();

  State(KtFile file, String text, String relative, boolean test) {
    this.file = file;
    this.relative = relative;
    this.test = test;
    this.lines = new Lines(text);
    this.locators = !test && LOCATOR_PACKAGES.stream().anyMatch(text::contains);
    for (KtImportDirective directive : file.getImportDirectives()) {
      var path = directive.getImportPath();
      if (path != null && !path.isAllUnder()) {
        String full = path.getFqName().asString();
        String simple = full.substring(full.lastIndexOf('.') + 1);
        if (Calls.WAIT_NAMES.contains(simple)) {
          waitImports.put(path.getAlias() == null ? simple : path.getAlias().asString(), full);
        }
      }
    }
  }

  String importedPath(String name) {
    return waitImports.get(name);
  }

  int lineOf(int offset) {
    return lines.index(offset) + 1;
  }

  Map<String, Object> result() {
    return m(
        "file", relative, "test", test, "package", file.getPackageFqName().asString(),
        "imports", imports(), "classes", classes, "functions", functions, "properties", properties,
        "waits", waits, "predicates", predicates, "typeAliases", typeAliases,
        "lookups", lookups, "typed", lookups.isEmpty() ? List.of() : typed,
        "calls", new ArrayList<Object>(calls.stream().map(Json.Raw::new).toList()),
        "references", new ArrayList<Object>(references));
  }

  private List<Object> imports() {
    List<Object> imports = new ArrayList<>();
    for (KtImportDirective directive : file.getImportDirectives()) {
      if (directive.getImportPath() != null) {
        var path = directive.getImportPath();
        imports.add(
            m(
                "path", path.getFqName().asString(),
                "alias", path.getAlias() == null ? null : path.getAlias().asString(),
                "all", path.isAllUnder()));
      }
    }
    return imports;
  }
}
