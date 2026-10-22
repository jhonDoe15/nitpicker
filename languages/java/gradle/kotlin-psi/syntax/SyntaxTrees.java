package nitpicker.kotlinpsi.syntax;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.common.Json;
import org.jetbrains.kotlin.com.intellij.lang.ASTNode;
import org.jetbrains.kotlin.com.intellij.psi.PsiComment;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiWhiteSpace;
import org.jetbrains.kotlin.psi.KtFile;

public final class SyntaxTrees {
  private static final Set<String> LEAVES = Set.of("PACKAGE_DIRECTIVE", "IMPORT_DIRECTIVE");
  private static final List<String> MARKERS =
      List.of("org.springframework", "jakarta.persistence", "javax.persistence", "org.hibernate");

  private SyntaxTrees() {}

  public static boolean wanted(String text) {
    return MARKERS.stream().anyMatch(text::contains);
  }

  public static String entry(KtFile parsed, String relative) {
    StringBuilder tree = new StringBuilder();
    write(parsed.getNode(), tree);
    return "{\"file\":" + Json.of(relative) + ",\"tree\":" + tree + "}";
  }

  private static void write(ASTNode node, StringBuilder out) {
    out.append("{\"t\":\"").append(node.getElementType()).append("\",\"s\":").append(node.getStartOffset())
        .append(",\"e\":").append(node.getStartOffset() + node.getTextLength());
    List<ASTNode> children = children(node);
    if (!children.isEmpty()) {
      out.append(",\"c\":[");
      for (int i = 0; i < children.size(); i++) {
        if (i > 0) {
          out.append(',');
        }
        write(children.get(i), out);
      }
      out.append(']');
    }
    out.append('}');
  }

  private static List<ASTNode> children(ASTNode node) {
    List<ASTNode> children = new ArrayList<>();
    if (LEAVES.contains(node.getElementType().toString())) {
      return children;
    }
    for (ASTNode child = node.getFirstChildNode(); child != null; child = child.getTreeNext()) {
      PsiElement psi = child.getPsi();
      if (!(psi instanceof PsiWhiteSpace) && !(psi instanceof PsiComment)) {
        children.add(child);
      }
    }
    return children;
  }
}
