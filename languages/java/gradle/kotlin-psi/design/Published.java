package nitpicker.kotlinpsi.design;

final class Published {
  private Published() {}

  static boolean library(Ctx ctx) {
    for (Owner owner : ctx.index.owners) {
      for (Fun function : owner.funs) {
        if (function.name.equals("main") && Entries.of(ctx, function)) {
          return false;
        }
      }
    }
    return true;
  }
}
