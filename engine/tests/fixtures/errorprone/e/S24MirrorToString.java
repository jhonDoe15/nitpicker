package e;

import com.google.errorprone.bugpatterns.BugChecker;
import javax.annotation.processing.Generated;
import javax.annotation.processing.ProcessingEnvironment;
import javax.lang.model.element.Element;
import javax.lang.model.type.TypeMirror;
import javax.lang.model.util.Elements;
import javax.lang.model.util.Types;

class S24MirrorToString {
  static class Checker extends BugChecker {
    boolean symbols(Element sym, String text) {
      boolean a = sym.toString().contains("x");
      boolean b = sym.toString().equals("match");
      boolean c = (sym + "").equals("x");
      boolean d = String.format("%s", sym).equals("x");
      boolean f = String.valueOf(sym).equals("x");
      boolean g = text.equals(sym.toString());
      return a || b || c || d || f || g;
    }

    @SuppressWarnings("SymbolToString")
    boolean suppressed(Element sym) {
      return sym.toString().equals("match");
    }

    class Inner {
      boolean inner(Element sym) {
        return sym.toString().equals("match");
      }
    }

    boolean types(TypeMirror type, TypeMirror other) {
      return type.toString().equals("match") || type.toString().equals(other.toString());
    }
  }

  static class Plain {
    boolean symbols(Element sym) {
      return sym.toString().equals("match");
    }
  }

  void types(TypeMirror type, Types types, TypeMirror other, Elements elements, String s) {
    if (type.toString().equals(other.toString())) {}
    if (type.toString().equals("java.lang.String")) {}
    if (type.toString().equals("void")) {}
    if (type.toString().equals("int")) {}
    if (type.toString().equals(s)) {}
    if (type.toString().equals("List<String>")) {}
    if (type.toString().contains("x")) {}
    if ((type + "").equals("x")) {}
    if (String.valueOf(type).equals("x")) {}
    if (String.format("%s", type).equals("x")) {}
    if (!type.toString().equals("a.b.C")) {}
    if ("x".equals(type.toString())) {}
  }

  void environment(ProcessingEnvironment env, TypeMirror type) {
    if (type.toString().equals("java.lang.String")) {}
    if (type.toString().equals(type.toString())) {}
  }

  void noTypes(TypeMirror type) {
    if (type.toString().equals("java.lang.String")) {}
    if (type.toString().equals("long")) {}
  }

  @SuppressWarnings("TypeToString")
  void suppressed(TypeMirror type) {
    if (type.toString().equals("x")) {}
  }

  @Generated("com.google.auto.value.processor.AutoValueProcessor")
  static class Generated1 {
    boolean equal(TypeMirror type, TypeMirror other) {
      return type.toString().equals(other.toString());
    }
  }

  @Generated("other")
  static class Generated2 {
    boolean equal(TypeMirror type, TypeMirror other) {
      return type.toString().equals(other.toString());
    }
  }
}
