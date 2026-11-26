class S21AvLeak {
  static S21AvOwner.Foo create() {
    return new AutoValue_S21AvOwner_Foo();
  }

  static Object builder() {
    return new AutoValue_S21AvOwner_Foo.Builder();
  }

  static Object reference() {
    return AutoValue_S21AvOwner_Foo.class;
  }

  @SuppressWarnings("AutoValueSubclassLeaked")
  static Object suppressed() {
    return new AutoValue_S21AvOwner_Foo();
  }
}

@javax.annotation.Generated("generator")
class S21AvGenerated {
  static S21AvOwner.Foo create() {
    return new AutoValue_S21AvOwner_Foo();
  }
}

class S21AvExtUse {
  static Object use() {
    return new $$AutoValue_S21AvExt() {};
  }
}
