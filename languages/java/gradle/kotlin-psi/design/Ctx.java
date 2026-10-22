package nitpicker.kotlinpsi.design;

import java.util.IdentityHashMap;
import java.util.Map;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.KtFile;

final class Ctx {
  final Index index;
  final TypeNames names;
  final Hierarchy hierarchy;
  final Members members;
  final Lambdas lambdas;
  final Bindings bindings;
  final Typer typer;
  final CallResolver calls;
  private final Map<KtFile, Source> files = new IdentityHashMap<>();

  Ctx(Index index) {
    this.index = index;
    for (Source source : index.sources) {
      files.put(source.psi, source);
    }
    this.names = new TypeNames(index);
    this.hierarchy = new Hierarchy(names, index);
    this.members = new Members(hierarchy);
    this.lambdas = new Lambdas(this);
    this.bindings = new Bindings(this);
    this.typer = new Typer(this);
    this.calls = new CallResolver(this);
  }

  Source sourceOf(PsiElement element) {
    return files.get(element.getContainingFile());
  }
}
