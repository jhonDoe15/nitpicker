package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;
import javax.lang.model.element.Modifier;

final class ParamInfo {
  final String name;
  final Tree type;
  final boolean varargs;

  ParamInfo(String name, Tree type, boolean varargs) {
    this.name = name;
    this.type = type;
    this.varargs = varargs;
  }
}
