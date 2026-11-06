package nitpicker.kotlinpsi.mutation;

import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.com.intellij.lang.ASTNode;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;

final class Spans {
  private final Lines lines;

  Spans(String text) {
    this.lines = new Lines(text);
  }

  int count() {
    return lines.count();
  }

  int line(int offset) {
    return lines.index(offset) + 1;
  }

  int startLine(PsiElement element) {
    return line(element.getTextRange().getStartOffset());
  }

  int endLine(PsiElement element) {
    return line(Math.max(0, element.getTextRange().getEndOffset() - 1));
  }

  int endLineNotBeforeStart(PsiElement element) {
    int start = element.getTextRange().getStartOffset();
    return line(Math.max(start, element.getTextRange().getEndOffset() - 1));
  }

  int firstLine(PsiElement element) {
    return line(significant(element.getNode(), true));
  }

  int lastLine(PsiElement element) {
    return line(Math.max(0, significant(element.getNode(), false) - 1));
  }

  int lastLineNotBeforeFirst(PsiElement element) {
    return line(
        Math.max(significant(element.getNode(), true), significant(element.getNode(), false) - 1));
  }

  private static int significant(ASTNode node, boolean first) {
    ASTNode current = first ? node.getFirstChildNode() : node.getLastChildNode();
    while (current != null
        && (KtTokens.WHITESPACES.contains(current.getElementType())
            || KtTokens.COMMENTS.contains(current.getElementType()))) {
      current = first ? current.getTreeNext() : current.getTreePrev();
    }
    if (first) {
      return current == null ? node.getStartOffset() : current.getStartOffset();
    }
    return current == null ? node.getTextRange().getEndOffset() : current.getTextRange().getEndOffset();
  }
}
