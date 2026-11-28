package com.google.common.truth;

public abstract class CustomSubjectBuilder {
  public interface Factory<CustomSubjectBuilderT extends CustomSubjectBuilder> {
    CustomSubjectBuilderT createSubjectBuilder(FailureMetadata metadata, StandardSubjectBuilder builder);
  }
}
