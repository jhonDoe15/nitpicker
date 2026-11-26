package com.google.errorprone;

import com.google.errorprone.suppliers.Supplier;
import com.sun.source.tree.Tree;
import java.util.function.Function;
import javacstub.Name;
import javacstub.Symbol;
import javacstub.Type;

public class VisitorState {
  public String getSourceForNode(Tree tree) {
    return null;
  }

  public Name getName(String name) {
    return null;
  }

  public Type getTypeFromString(String name) {
    return null;
  }

  public Symbol getSymbolFromString(String name) {
    return null;
  }

  public static <T> Supplier<T> memoize(Function<VisitorState, T> f) {
    return null;
  }
}
