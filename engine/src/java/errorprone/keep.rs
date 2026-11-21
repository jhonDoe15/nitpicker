//! Annotations that say a declaration is used from outside the code, as Error Prone's `WellKnownKeep` lists them.
use super::Context;
use crate::engine::source::children;
use crate::java::types::model::flag;
use tree_sitter::Node;

const ALWAYS: [&str; 2] = ["org.apache.beam.sdk.transforms.DoFn.ProcessElement", "org.junit.jupiter.api.Nested"];
pub const VARIABLES: &[&str] = &[
    "jakarta.persistence.Basic",
    "jakarta.persistence.Column",
    "jakarta.persistence.Id",
    "jakarta.persistence.Version",
    "jakarta.xml.bind.annotation.XmlElement",
    "javax.persistence.Basic",
    "javax.persistence.Column",
    "javax.persistence.Id",
    "javax.persistence.Version",
    "javax.xml.bind.annotation.XmlElement",
    "net.starlark.java.annot.StarlarkBuiltin",
    "org.junit.Rule",
    "org.junit.jupiter.api.extension.RegisterExtension",
    "org.openqa.selenium.support.FindAll",
    "org.openqa.selenium.support.FindBy",
    "org.openqa.selenium.support.FindBys",
    "org.apache.beam.sdk.transforms.DoFn.TimerId",
    "org.apache.beam.sdk.transforms.DoFn.StateId",
    "org.springframework.boot.test.mock.mockito.MockBean",
    "org.springframework.test.context.bean.override.mockito.MockitoBean",
];
pub const METHODS: &[&str] = &[
    "com.google.inject.Inject",
    "javax.inject.Inject",
    "jakarta.inject.Inject",
    "com.google.inject.Provides",
    "dagger.Provides",
    "com.google.inject.multibindings.ProvidesIntoMap",
    "com.google.inject.multibindings.ProvidesIntoSet",
    "com.google.inject.multibindings.ProvidesIntoOptional",
    "android.webkit.JavascriptInterface",
    "com.fasterxml.jackson.annotation.JsonCreator",
    "com.fasterxml.jackson.annotation.JsonProperty",
    "com.fasterxml.jackson.annotation.JsonSetter",
    "com.fasterxml.jackson.annotation.JsonValue",
    "com.google.acai.AfterTest",
    "com.google.acai.BeforeSuite",
    "com.google.acai.BeforeTest",
    "com.google.caliper.Benchmark",
    "com.google.common.eventbus.Subscribe",
    "com.google.inject.throwingproviders.CheckedProvides",
    "com.tngtech.java.junit.dataprovider.DataProvider",
    "jakarta.annotation.PreDestroy",
    "jakarta.annotation.PostConstruct",
    "jakarta.persistence.PostLoad",
    "jakarta.persistence.PostPersist",
    "jakarta.persistence.PostRemove",
    "jakarta.persistence.PostUpdate",
    "jakarta.persistence.PrePersist",
    "jakarta.persistence.PreRemove",
    "jakarta.persistence.PreUpdate",
    "jakarta.validation.constraints.AssertFalse",
    "jakarta.validation.constraints.AssertTrue",
    "javax.annotation.PreDestroy",
    "javax.annotation.PostConstruct",
    "javax.persistence.PostLoad",
    "javax.persistence.PostPersist",
    "javax.persistence.PostRemove",
    "javax.persistence.PostUpdate",
    "javax.persistence.PrePersist",
    "javax.persistence.PreRemove",
    "javax.persistence.PreUpdate",
    "javax.validation.constraints.AssertFalse",
    "javax.validation.constraints.AssertTrue",
    "net.bytebuddy.asm.Advice.OnMethodEnter",
    "net.bytebuddy.asm.Advice.OnMethodExit",
    "org.apache.beam.sdk.transforms.DoFn.FinishBundle",
    "org.apache.beam.sdk.transforms.DoFn.ProcessElement",
    "org.apache.beam.sdk.transforms.DoFn.StartBundle",
    "org.aspectj.lang.annotation.Pointcut",
    "org.aspectj.lang.annotation.After",
    "org.aspectj.lang.annotation.Before",
    "org.springframework.context.annotation.Bean",
    "org.testng.annotations.AfterClass",
    "org.testng.annotations.AfterMethod",
    "org.testng.annotations.BeforeClass",
    "org.testng.annotations.BeforeMethod",
    "org.testng.annotations.DataProvider",
    "org.junit.jupiter.api.BeforeAll",
    "org.junit.jupiter.api.AfterAll",
    "org.junit.jupiter.api.AfterEach",
    "org.junit.jupiter.api.BeforeEach",
    "org.junit.jupiter.api.RepeatedTest",
    "org.junit.jupiter.api.Test",
    "org.junit.jupiter.params.ParameterizedTest",
];
pub const CLASSES: &[&str] = &["org.junit.jupiter.api.Nested"];

/// The full names of the annotations written on a declaration; a name that cannot be found stays as written.
pub fn annotations(context: &Context, declaration: Node) -> Vec<String> {
    let Some(modifiers) = crate::java::helpers::modifiers(declaration) else { return Vec::new() };
    let written = children(modifiers).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation"));
    written
        .filter_map(|annotation| annotation.child_by_field_name("name"))
        .map(|name| context.resolver.class_name(declaration, context.text(name)).unwrap_or_else(|| context.text(name).to_string()))
        .collect()
}

/// The declaration carries an annotation that keeps it, directly or through an annotation that is itself kept.
pub fn should_keep(context: &Context, declaration: Node, listed: &[&str]) -> bool {
    annotations(context, declaration).iter().any(|name| {
        let simple = name.rsplit('.').next().unwrap_or(name);
        matches!(simple, "Keep" | "UsedReflectively")
            || ALWAYS.contains(&name.as_str())
            || listed.contains(&name.as_str())
            || context.resolver.index.get(name).is_some_and(|info| info.flags & flag::KEPT != 0)
    })
}
