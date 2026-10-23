package nitpicker.kotlinpsi.design;

import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;

public final class Published {
  private Published() {}

  public static boolean library(Ctx ctx) {
    for (Owner owner : ctx.index.owners) {
      if (hasMain(ctx, owner)) {
        return false;
      }
    }
    return true;
  }

  private static boolean hasMain(Ctx ctx, Owner owner) {
    for (Fun function : owner.funs) {
      if (function.name.equals("main") && Entries.of(ctx, function)) {
        return true;
      }
    }
    return false;
  }
}
