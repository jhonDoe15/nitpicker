package e;

import com.google.errorprone.annotations.DoNotMock;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@DoNotMock("Use the real thing from the other file")
class S9ElsewhereClass {}

@DoNotMock
interface S9ElsewhereDefault {}

@DoNotMock("")
class S9ElsewhereEmpty {}

@DoNotMock("meta from the other file")
@Retention(RetentionPolicy.RUNTIME)
@interface S9ElsewhereMeta {}

@S9ElsewhereMeta
class S9ElsewhereMarked {}

class S9ElsewhereChild extends S9ElsewhereClass implements S9ElsewhereDefault {}

class S9ElsewhereGrandChild extends S9ElsewhereMarked {}
