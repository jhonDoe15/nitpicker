package nitpicker.kotlinpsi.common;

import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import org.jetbrains.kotlin.psi.*;

public final class Signatures {
  private Signatures() {}

  public static List<Object> typeBounds(List<KtTypeParameter> parameters) {
    List<Object> bounds = new ArrayList<>();
    for (KtTypeParameter parameter : parameters) {
      bounds.add(m("name", parameter.getName(), "bound", clip(parameter.getExtendsBound())));
    }
    return bounds.isEmpty() ? null : bounds;
  }

  public static List<Object> genericSupers(KtClassOrObject klass) {
    List<Object> texts = new ArrayList<>();
    for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
      if (entry.getTypeReference() != null && entry.getTypeReference().getText().contains("<")) {
        texts.add(entry.getTypeReference().getText());
      }
    }
    return texts.isEmpty() ? null : texts;
  }

  public static List<Object> parameterTypes(KtNamedFunction function) {
    List<Object> types = new ArrayList<>();
    for (KtParameter parameter : function.getValueParameters()) {
      types.add(m("type", clip(parameter.getTypeReference()), "vararg", parameter.isVarArg()));
    }
    return types;
  }
}
