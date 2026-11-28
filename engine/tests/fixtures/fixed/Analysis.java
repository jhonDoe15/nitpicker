package fixed;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Analysis {
  private final TypeResolver resolver = new TypeResolver(null);

  public List<String> perClass(SourceFile file) {
    List<String> out = new ArrayList<>();
    for (ClassDecl decl : file.classes()) {
      SummaryCache summaries = new SummaryCache(file);
      out.add(summaries.describe(decl));
    }
    return out;
  }

  public void perDeclaration(SourceFile file) {
    file.classes().forEach(decl -> {
      SummaryCache summaries = new SummaryCache(file);
      summaries.describe(decl);
    });
  }

  public void perFile(List<SourceFile> files) {
    files.forEach(file -> {
      Map<String, String> calleeCache = new HashMap<>();
      file.classes().forEach(decl -> calleeCache.put(decl.name(), decl.name()));
    });
  }

  public List<String> keyed(List<SourceFile> files) {
    List<String> out = new ArrayList<>();
    for (SourceFile file : files) {
      SummaryCache summaries = new SummaryCache(file);
      out.add(summaries.describe(null));
    }
    return out;
  }

  public List<SummaryCache> kept(SourceFile file) {
    List<SummaryCache> all = new ArrayList<>();
    for (ClassDecl decl : file.classes()) {
      SummaryCache summaries = new SummaryCache(file);
      all.add(summaries);
    }
    return all;
  }

  public void plainMap(List<SourceFile> files) {
    for (SourceFile file : files) {
      Map<String, String> names = new HashMap<>();
      names.put(file.toString(), "");
    }
  }

  public void outside(SourceFile file) {
    SummaryCache summaries = new SummaryCache(file);
    for (ClassDecl decl : file.classes()) {
      summaries.describe(decl);
    }
  }

  public void derived(List<SourceFile> files) {
    for (SourceFile file : files) {
      SourceFile parsed = file;
      SummaryCache summaries = new SummaryCache(parsed);
      summaries.describe(null);
    }
  }

  public void nested(List<SourceFile> files) {
    for (SourceFile file : files) {
      for (ClassDecl decl : file.classes()) {
        SummaryCache summaries = new SummaryCache(file);
        summaries.describe(decl);
      }
    }
  }

  public void registered(SourceFile file, List<Object> out) {
    for (ClassDecl decl : file.classes()) {
      SummaryCache summaries = new SummaryCache(file);
      out.add(List.of(summaries));
    }
  }

  public void moving(SourceFile start) {
    SourceFile current = start;
    while (current != null) {
      SummaryCache summaries = new SummaryCache(current);
      summaries.describe(null);
      current = null;
    }
  }

  public void called(List<SourceFile> files, java.util.Iterator<SourceFile> it) {
    while (it.hasNext()) {
      SummaryCache summaries = new SummaryCache(it.next());
      summaries.describe(null);
    }
  }

  interface SourceFile {
    List<ClassDecl> classes();
  }

  interface ClassDecl {
    String name();
  }

  static class SummaryCache {
    SummaryCache(SourceFile file) {}

    String describe(ClassDecl decl) {
      return "";
    }
  }

  static class TypeResolver {
    TypeResolver(SourceFile file) {}
  }
}
