package nitpicker.designfacts.scope;

import java.util.*;
import nitpicker.designfacts.model.*;

public final class Local {
  public final String name;
  public final int param;
  public Ty ty;

  public Local(String name, Ty ty, int param) {
    this.name = name;
    this.ty = ty;
    this.param = param;
  }
}
