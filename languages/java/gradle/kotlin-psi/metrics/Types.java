package nitpicker.kotlinpsi.metrics;

import java.util.*;
import nitpicker.kotlinpsi.common.Json;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Types {
  private Types() {}

  public static void collect(KtFile file, String text, String relative, List<String> entries) {
    for (KtClassOrObject type : PsiTreeUtil.findChildrenOfType(file, KtClassOrObject.class)) {
      if (type instanceof KtEnumEntry || type.isLocal()
          || (type instanceof KtObjectDeclaration && ((KtObjectDeclaration) type).isObjectLiteral())) {
        continue;
      }
      List<String> names = new ArrayList<>();
      for (KtClassOrObject owner = type; owner != null;
          owner = PsiTreeUtil.getParentOfType(owner, KtClassOrObject.class, true)) {
        names.add(0, owner.getName() == null ? "Companion" : owner.getName());
      }
      int fields = 0;
      for (KtParameter parameter : type.getPrimaryConstructorParameters()) {
        fields += parameter.hasValOrVar() ? 1 : 0;
      }
      for (KtDeclaration declaration : type.getDeclarations()) {
        fields += declaration instanceof KtProperty && hasField(type, (KtProperty) declaration) ? 1 : 0;
      }
      String superclass = null;
      for (KtSuperTypeListEntry entry : type.getSuperTypeListEntries()) {
        if (entry instanceof KtSuperTypeCallEntry && entry.getTypeReference() != null) {
          superclass = entry.getTypeReference().getText().replaceAll("<.*", "").replaceAll("\\s", "");
        }
      }
      int offset = type.getNameIdentifier() == null ? type.getTextOffset() : type.getNameIdentifier().getTextOffset();
      int start = text.substring(0, Math.min(offset, text.length())).split("\n", -1).length;
      entries.add("{\"file\":" + Json.quote(relative) + ",\"name\":" + Json.quote(String.join(".", names))
          + ",\"start\":" + start + ",\"kind\":" + Json.quote(kindOf(type)) + ",\"methods\":"
          + type.getDeclarations().stream().filter(KtNamedFunction.class::isInstance).count()
          + ",\"fields\":" + fields + (superclass == null ? "" : ",\"extends\":" + Json.quote(superclass)) + "}");
    }
  }

  private static boolean hasField(KtClassOrObject type, KtProperty property) {
    if (property.hasModifier(KtTokens.ABSTRACT_KEYWORD) || property.hasModifier(KtTokens.CONST_KEYWORD)
        || (type instanceof KtClass && ((KtClass) type).isInterface())) {
      return false;
    }
    boolean computed = property.getAccessors().stream().anyMatch(KtPropertyAccessor::hasBody);
    return property.hasInitializer() || property.hasDelegate()
        || property.hasModifier(KtTokens.LATEINIT_KEYWORD) || !computed;
  }

  private static String kindOf(KtClassOrObject type) {
    if (type instanceof KtObjectDeclaration) {
      return ((KtObjectDeclaration) type).isCompanion() ? "companion object" : "object";
    }
    KtClass declared = (KtClass) type;
    if (declared.isInterface()) {
      return "interface";
    }
    if (declared.isEnum()) {
      return "enum class";
    }
    if (declared.isData()) {
      return "data class";
    }
    return declared.isAnnotation() ? "annotation class" : "class";
  }
}
