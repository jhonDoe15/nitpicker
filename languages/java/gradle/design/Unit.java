package nitpicker.designfacts;

import com.sun.source.tree.*;
import com.sun.source.util.SourcePositions;
import java.io.IOException;
import java.util.*;

final class Unit {
  final String file;
  final CompilationUnitTree tree;
  final SourcePositions positions;
  final String source;
  final String pkg;
  final Map<String, String> single = new HashMap<>();
  final List<String> onDemand = new ArrayList<>();
  final List<String> staticSingle = new ArrayList<>();
  final List<String> staticOnDemand = new ArrayList<>();
  final boolean lombok;

  Unit(String file, CompilationUnitTree tree, SourcePositions positions) throws IOException {
    this.file = file;
    this.tree = tree;
    this.positions = positions;
    this.source = tree.getSourceFile().getCharContent(true).toString();
    this.pkg = tree.getPackageName() == null ? "" : tree.getPackageName().toString();
    boolean lombokImport = false;
    for (ImportTree item : tree.getImports()) {
      String name = item.getQualifiedIdentifier().toString();
      lombokImport |= name.startsWith("lombok.");
      boolean wildcard = name.endsWith(".*");
      String base = wildcard ? name.substring(0, name.length() - 2) : name;
      if (item.isStatic()) {
        (wildcard ? staticOnDemand : staticSingle).add(base);
      } else if (wildcard) {
        onDemand.add(base);
      } else {
        single.put(base.substring(base.lastIndexOf('.') + 1), base);
      }
    }
    this.lombok = lombokImport;
  }

  int line(Tree node) {
    return lineAt(positions.getStartPosition(tree, node));
  }

  int lineAt(long position) {
    return (int) tree.getLineMap().getLineNumber(Math.max(position, 0));
  }

  long start(Tree node) {
    return positions.getStartPosition(tree, node);
  }

  long end(Tree node) {
    return positions.getEndPosition(tree, node);
  }

  String text(Tree node) {
    long from = start(node);
    long to = end(node);
    return from < 0 || to < from || to > source.length() ? "" : source.substring((int) from, (int) to);
  }
}
