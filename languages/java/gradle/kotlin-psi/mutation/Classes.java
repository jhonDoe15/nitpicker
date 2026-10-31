package nitpicker.kotlinpsi.mutation;

import static nitpicker.kotlinpsi.common.Psi.annotationNames;
import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import nitpicker.kotlinpsi.metrics.FileClasses;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtClass;
import org.jetbrains.kotlin.psi.KtClassBody;
import org.jetbrains.kotlin.psi.KtClassInitializer;
import org.jetbrains.kotlin.psi.KtClassOrObject;
import org.jetbrains.kotlin.psi.KtDeclaration;
import org.jetbrains.kotlin.psi.KtEnumEntry;
import org.jetbrains.kotlin.psi.KtFile;
import org.jetbrains.kotlin.psi.KtNamedFunction;
import org.jetbrains.kotlin.psi.KtObjectDeclaration;
import org.jetbrains.kotlin.psi.KtParameter;
import org.jetbrains.kotlin.psi.KtProperty;
import org.jetbrains.kotlin.psi.KtPropertyAccessor;

final class Classes {
  final List<Object> entries = new ArrayList<>();
  private final Spans spans;
  private final Functions functions;

  Classes(Spans spans, Functions functions) {
    this.spans = spans;
    this.functions = functions;
  }

  void declareFile(KtFile file) {
    String prefix = file.getPackageFqName().isRoot() ? "" : file.getPackageFqName().asString() + ".";
    List<KtDeclaration> topLevel = new ArrayList<>();
    for (KtDeclaration declaration : file.getDeclarations()) {
      if (declaration instanceof KtClassOrObject) {
        declareClass((KtClassOrObject) declaration, prefix);
      } else {
        topLevel.add(declaration);
      }
    }
    if (!topLevel.isEmpty()) {
      facade(topLevel, prefix + FileClasses.codeClass(file));
    }
  }

  private void facade(List<KtDeclaration> declarations, String name) {
    entries.add(
        entry(
            name,
            m("kind", "facade", "start", 0, "headerEnd", 0, "init", false, "serializable", false),
            declarations));
    for (KtDeclaration declaration : declarations) {
      if (declaration instanceof KtNamedFunction) {
        functions.declare((KtNamedFunction) declaration, name, null);
      } else if (declaration instanceof KtProperty) {
        functions.declareAccessors((KtProperty) declaration, name);
      }
    }
  }

  private void declareClass(KtClassOrObject klass, String prefix) {
    String simple = klass.getName();
    if (simple == null && klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion()) {
      simple = "Companion";
    }
    KtClassBody body = klass.getBody();
    if (simple == null || (klass instanceof KtEnumEntry && body == null)) {
      return;
    }
    String name = prefix + simple;
    List<KtDeclaration> members = new ArrayList<>(klass.getDeclarations());
    List<KtDeclaration> all = new ArrayList<>(members);
    for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
      if (parameter.hasValOrVar()) {
        all.add(parameter);
      }
    }
    boolean init =
        members.stream().anyMatch(member -> member instanceof KtClassInitializer)
            || !klass.getSecondaryConstructors().isEmpty();
    boolean serializable = annotationNames(klass).contains("Serializable");
    Map<String, Object> header =
        m(
            "kind", kind(klass), "start", spans.firstLine(klass), "headerEnd", headerEnd(klass, body),
            "init", init, "serializable", serializable);
    entries.add(entry(name, header, all));
    for (KtDeclaration member : members) {
      if (member instanceof KtClassOrObject) {
        declareClass((KtClassOrObject) member, name + "$");
      } else if (member instanceof KtNamedFunction) {
        functions.declare((KtNamedFunction) member, name, staticOwner(klass, prefix));
      } else if (member instanceof KtProperty) {
        functions.declareAccessors((KtProperty) member, name);
      }
    }
  }

  private int headerEnd(KtClassOrObject klass, KtClassBody body) {
    return body == null || body.getLBrace() == null
        ? spans.lastLine(klass)
        : spans.startLine(body.getLBrace());
  }

  private String staticOwner(KtClassOrObject klass, String prefix) {
    boolean companion = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion();
    return companion && prefix.endsWith("$") ? prefix.substring(0, prefix.length() - 1) : null;
  }

  private String kind(KtClassOrObject klass) {
    if (klass instanceof KtObjectDeclaration) {
      return "object";
    }
    KtClass ktClass = (KtClass) klass;
    if (ktClass.isData()) {
      return "data";
    }
    if (ktClass.hasModifier(KtTokens.VALUE_KEYWORD) || ktClass.hasModifier(KtTokens.INLINE_KEYWORD)) {
      return "value";
    }
    if (ktClass.isEnum()) {
      return "enum";
    }
    if (ktClass.isInterface()) {
      return "interface";
    }
    return ktClass.isAnnotation() ? "annotation" : "class";
  }

  private Map<String, Object> entry(String name, Map<String, Object> header, List<KtDeclaration> members) {
    List<String> functionNames = new ArrayList<>();
    List<Object> properties = new ArrayList<>();
    for (KtDeclaration member : members) {
      if (member instanceof KtNamedFunction && member.getName() != null) {
        functionNames.add(member.getName());
      } else if (member instanceof KtProperty) {
        properties.add(property((KtProperty) member));
      } else if (member instanceof KtParameter) {
        properties.add(
            propertyEntry(member, m("constructor", true, "getter", false, "setter", false, "delegated", false)));
      }
    }
    Map<String, Object> entry = m("name", name);
    entry.putAll(header);
    entry.put("functions", functionNames);
    entry.put("properties", properties);
    return entry;
  }

  private Map<String, Object> property(KtProperty property) {
    KtPropertyAccessor getter = property.getGetter();
    KtPropertyAccessor setter = property.getSetter();
    return propertyEntry(
        property,
        m(
            "constructor", false,
            "getter", getter != null && getter.hasBody(),
            "setter", setter != null && setter.hasBody(),
            "delegated", property.hasDelegate()));
  }

  private Map<String, Object> propertyEntry(KtDeclaration declaration, Map<String, Object> flags) {
    Map<String, Object> entry =
        m(
            "name", String.valueOf(declaration.getName()),
            "start", spans.firstLine(declaration),
            "end", spans.lastLineNotBeforeFirst(declaration));
    entry.putAll(flags);
    return entry;
  }
}
