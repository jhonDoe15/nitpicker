package nitpicker.designfacts.model;

import com.sun.source.tree.*;
import java.util.*;
import javax.lang.model.element.Modifier;

public final class ParamInfo {
  public final String name;
  public final Tree type;
  public final boolean varargs;

  public ParamInfo(String name, Tree type, boolean varargs) {
    this.name = name;
    this.type = type;
    this.varargs = varargs;
  }
}
