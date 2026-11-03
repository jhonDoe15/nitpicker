package nitpicker.kotlinpsi.metrics;

import java.util.*;
import java.util.stream.Collectors;
import nitpicker.kotlinpsi.common.Json;
import org.jetbrains.kotlin.psi.*;

public final class FileClasses {
  private FileClasses() {}

  public static String describe(KtFile file, String relative, Set<String> claimedFacades) {
    String packageName = file.getPackageFqName().asString();
    String prefix = packageName.isEmpty() ? "" : packageName + ".";
    List<String> classes = new ArrayList<>();
    boolean facade = false;
    for (KtDeclaration declaration : file.getDeclarations()) {
      if (declaration instanceof KtClassOrObject) {
        String name = ((KtClassOrObject) declaration).getName();
        if (name != null) {
          classes.add(prefix + name);
        }
      } else if (declaration instanceof KtNamedFunction || declaration instanceof KtProperty) {
        facade = true;
      }
    }
    if (facade) {
      String facadeName = jvmName(file);
      if (facadeName == null) {
        facadeName = facadeOf(file.getName());
      }
      if (multifile(file)) {
        classes.add(prefix + facadeName + "__" + facadeOf(file.getName()));
      }
      if (!multifile(file) || claimedFacades.add(prefix + facadeName)) {
        classes.add(prefix + facadeName);
      }
    }
    List<String> imports = new ArrayList<>();
    for (KtImportDirective directive : file.getImportDirectives()) {
      if (directive.getImportedFqName() != null) {
        imports.add(Json.quote(directive.getImportedFqName().asString() + (directive.isAllUnder() ? ".*" : "")));
      }
    }
    return "{\"file\":" + Json.quote(relative) + ",\"package\":" + Json.quote(packageName) + ",\"classes\":["
        + classes.stream().map(Json::quote).collect(Collectors.joining(",")) + "],\"imports\":["
        + String.join(",", imports) + "]}";
  }

  public static String codeClass(KtFile file) {
    String facadeName = jvmName(file);
    if (facadeName == null) {
      facadeName = facadeOf(file.getName());
    }
    return multifile(file) ? facadeName + "__" + facadeOf(file.getName()) : facadeName;
  }

  private static boolean multifile(KtFile file) {
    return file.getAnnotationEntries().stream()
        .anyMatch(
            entry ->
                entry.getShortName() != null && "JvmMultifileClass".equals(entry.getShortName().asString()));
  }

  private static String jvmName(KtFile file) {
    for (KtAnnotationEntry entry : file.getAnnotationEntries()) {
      if ("JvmName".equals(entry.getShortName() == null ? null : entry.getShortName().asString())
          && !entry.getValueArguments().isEmpty()) {
        String argument = entry.getValueArguments().get(0).getArgumentExpression().getText();
        return argument.replace("\"", "");
      }
    }
    return null;
  }

  private static String facadeOf(String fileName) {
    String base = fileName.endsWith(".kt") ? fileName.substring(0, fileName.length() - 3) : fileName;
    StringBuilder name = new StringBuilder();
    for (int i = 0; i < base.length(); i++) {
      char c = base.charAt(i);
      name.append(Character.isJavaIdentifierPart(c) ? c : '_');
    }
    if (name.length() > 0) {
      name.setCharAt(0, Character.toUpperCase(name.charAt(0)));
    }
    return name + "Kt";
  }
}
