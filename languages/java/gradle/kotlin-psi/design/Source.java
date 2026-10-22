package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.name.FqName;
import org.jetbrains.kotlin.psi.KtFile;
import org.jetbrains.kotlin.psi.KtImportDirective;
import org.jetbrains.kotlin.resolve.ImportPath;

public final class Source {
  final KtFile psi;
  final String path;
  final String pkg;
  final String stem;
  final Map<String, String> imports = new HashMap<>();
  final List<String> stars = new ArrayList<>();
  private final Lines lines;

  public Source(KtFile psi, String path, String text) {
    this.psi = psi;
    this.path = path;
    this.lines = new Lines(text);
    this.pkg = psi.getPackageFqName().asString();
    String file = path.substring(path.lastIndexOf('/') + 1);
    this.stem = file.endsWith(".kt") ? file.substring(0, file.length() - 3) : file;
    for (KtImportDirective directive : psi.getImportDirectives()) {
      ImportPath target = directive.getImportPath();
      if (target == null) {
        continue;
      }
      FqName name = target.getFqName();
      if (target.isAllUnder()) {
        stars.add(name.asString());
      } else {
        String local = target.getAlias() == null ? name.shortName().asString() : target.getAlias().asString();
        imports.put(local, name.asString());
      }
    }
  }

  int line(PsiElement element) {
    return lines.index(element.getTextOffset()) + 1;
  }
}
