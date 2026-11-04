package nitpicker.designfacts.scope;

import nitpicker.designfacts.model.*;

public final class Local {
  public final String key;
  public final int param;
  public Ty ty;
  int classDepth;

  public Local(String key, Ty ty, int param) {
    this.key = key;
    this.ty = ty;
    this.param = param;
  }
}
