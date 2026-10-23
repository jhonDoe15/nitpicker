package nitpicker.kotlinpsi.design;

import java.util.IdentityHashMap;
import java.util.Map;
import nitpicker.kotlinpsi.design.index.Hierarchy;
import nitpicker.kotlinpsi.design.index.Index;
import nitpicker.kotlinpsi.design.index.Members;
import nitpicker.kotlinpsi.design.index.TypeNames;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.resolve.Bindings;
import nitpicker.kotlinpsi.design.resolve.CallResolver;
import nitpicker.kotlinpsi.design.syntax.Lambdas;
import nitpicker.kotlinpsi.design.syntax.References;
import nitpicker.kotlinpsi.design.syntax.Typer;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.KtFile;

public final class Ctx {
  public final Index index;
  public final TypeNames names;
  public final Hierarchy hierarchy;
  public final Members members;
  public final Lambdas lambdas;
  public final Bindings bindings;
  public final Typer typer;
  public final CallResolver calls;
  public final References references;
  private final Map<KtFile, Source> files = new IdentityHashMap<>();

  public Ctx(Index index) {
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
    this.references = new References(this);
  }

  public Source sourceOf(PsiElement element) {
    return files.get(element.getContainingFile());
  }
}
