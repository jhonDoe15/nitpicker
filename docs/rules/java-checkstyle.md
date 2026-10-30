# Java and Kotlin: Checkstyle rules

The checks of Checkstyle's Google style that the Java and Kotlin presets run on Java sources: Java with Gradle or Maven, Kotlin with Gradle. This page lists 72 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md#slice-3-checkstyle](../java-preset.md#slice-3-checkstyle).

Checkstyle 10.21.1 is under the LGPL-2.1, so this page names each rule and its category only; the description is in the documentation each entry links to.

In the Java preset, an entry of `exceptions` names a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `spring` and `test-runtime`, or one of these rules: `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `test-only-export`, `doc-comment-content`, `test-console-output`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit` and `inheritance-depth-limit`. The Kotlin preset takes the same `<tool>/<rule>` form for the Java sources of a mixed module.

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven (Java); Gradle (Kotlin)

<a id="checkstyle-abbreviationaswordinname"></a>

### `checkstyle/AbbreviationAsWordInName`

Abbreviation as word in name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Treat abbreviations as words: no run of capitals, so parseUrl, HttpClient, userId, never parseURL, HTTPClient or userID.
- **Exception:** If this is intended, add `{"rule":"checkstyle/AbbreviationAsWordInName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/abbreviationaswordinname.html)

<a id="checkstyle-annotationlocationmostcases"></a>

### `checkstyle/AnnotationLocationMostCases`

Annotation location.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/AnnotationLocationMostCases","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/annotation/annotationlocation.html)

<a id="checkstyle-annotationlocationvariables"></a>

### `checkstyle/AnnotationLocationVariables`

Annotation location.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/AnnotationLocationVariables","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/annotation/annotationlocation.html)

<a id="checkstyle-arraytypestyle"></a>

### `checkstyle/ArrayTypeStyle`

Array type style.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Put the brackets on the type, as in int[] values and String[] names, never int values[].
- **Exception:** If this is intended, add `{"rule":"checkstyle/ArrayTypeStyle","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/misc/arraytypestyle.html)

<a id="checkstyle-atclauseorder"></a>

### `checkstyle/AtclauseOrder`

Atclause order.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Order Javadoc block tags as @param, @return, @throws, @deprecated.
- **Exception:** If this is intended, add `{"rule":"checkstyle/AtclauseOrder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/atclauseorder.html)

<a id="checkstyle-avoidescapedunicodecharacters"></a>

### `checkstyle/AvoidEscapedUnicodeCharacters`

Avoid escaped unicode characters.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Write the real character, such as é, in the UTF-8 source instead of a \u escape; keep escapes only for control and invisible characters.
- **Exception:** If this is intended, add `{"rule":"checkstyle/AvoidEscapedUnicodeCharacters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/misc/avoidescapedunicodecharacters.html)

<a id="checkstyle-avoidstarimport"></a>

### `checkstyle/AvoidStarImport`

Avoid star import.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Import each class by name (import java.util.List;), never a wildcard like java.util.\*.
- **Exception:** If this is intended, add `{"rule":"checkstyle/AvoidStarImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/imports/avoidstarimport.html)

<a id="checkstyle-catchparametername"></a>

### `checkstyle/CatchParameterName`

Catch parameter name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name the catch parameter lowerCamelCase, one letter or two or more characters with a lowercase or digit second, such as e or ioException.
- **Exception:** If this is intended, add `{"rule":"checkstyle/CatchParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/catchparametername.html)

<a id="checkstyle-classtypeparametername"></a>

### `checkstyle/ClassTypeParameterName`

Class type parameter name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name class type parameters with one capital letter and an optional digit (T, K2), or a capitalized name ending in T (RequestT).
- **Exception:** If this is intended, add `{"rule":"checkstyle/ClassTypeParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/classtypeparametername.html)

<a id="checkstyle-commentsindentation"></a>

### `checkstyle/CommentsIndentation`

Comments indentation.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/CommentsIndentation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/indentation/commentsindentation.html)

<a id="checkstyle-constructorsdeclarationgrouping"></a>

### `checkstyle/ConstructorsDeclarationGrouping`

Constructors declaration grouping.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Declare all constructors of a class next to each other, with no methods or fields between them.
- **Exception:** If this is intended, add `{"rule":"checkstyle/ConstructorsDeclarationGrouping","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/constructorsdeclarationgrouping.html)

<a id="checkstyle-customimportorder"></a>

### `checkstyle/CustomImportOrder`

Custom import order.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/CustomImportOrder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/imports/customimportorder.html)

<a id="checkstyle-emptycatchblock"></a>

### `checkstyle/EmptyCatchBlock`

Empty catch block.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Handle the exception: return a failure value, log and recover, or rethrow with the cause; in tests use assertThrows.
- **Exception:** If this is intended, add `{"rule":"checkstyle/EmptyCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/blocks/emptycatchblock.html)

<a id="checkstyle-emptylineseparator"></a>

### `checkstyle/EmptyLineSeparator`

Empty line separator.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/EmptyLineSeparator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/emptylineseparator.html)

<a id="checkstyle-fallthrough"></a>

### `checkstyle/FallThrough`

Fall through.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Rewrite the switch in arrow form, case A, B -> ..., which cannot fall through; in a colon-form switch end every case with break, return or throw.
- **Exception:** If this is intended, add `{"rule":"checkstyle/FallThrough","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/fallthrough.html)

<a id="checkstyle-filetabcharacter"></a>

### `checkstyle/FileTabCharacter`

File tab character.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run google-java-format for indentation tabs; inside a string, char literal or text block write the escape \t instead of a real tab.
- **Exception:** If this is intended, add `{"rule":"checkstyle/FileTabCharacter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/filetabcharacter.html)

<a id="checkstyle-genericwhitespace"></a>

### `checkstyle/GenericWhitespace`

Generic whitespace.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/GenericWhitespace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/genericwhitespace.html)

<a id="checkstyle-illegaltokentext"></a>

### `checkstyle/IllegalTokenText`

Illegal token text.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Use the escape sequences \n, \t, \r, \f, \", \' and \\ instead of a unicode or octal escape for those characters.
- **Exception:** If this is intended, add `{"rule":"checkstyle/IllegalTokenText","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/illegaltokentext.html)

<a id="checkstyle-indentation"></a>

### `checkstyle/Indentation`

Indentation.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/Indentation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/indentation/indentation.html)

<a id="checkstyle-interfacetypeparametername"></a>

### `checkstyle/InterfaceTypeParameterName`

Interface type parameter name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name interface type parameters with one capital letter and an optional digit (T, K2), or a capitalized name ending in T (ResultT).
- **Exception:** If this is intended, add `{"rule":"checkstyle/InterfaceTypeParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/interfacetypeparametername.html)

<a id="checkstyle-invalidjavadocposition"></a>

### `checkstyle/InvalidJavadocPosition`

Invalid javadoc position.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Put a Javadoc comment directly before the class, method or field it documents; use // or /\* \*/ for any other comment.
- **Exception:** If this is intended, add `{"rule":"checkstyle/InvalidJavadocPosition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/invalidjavadocposition.html)

<a id="checkstyle-javadocmethod"></a>

### `checkstyle/JavadocMethod`

Javadoc method.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Make the Javadoc match the signature: @param only for real parameter names, and no @return on a void method or constructor.
- **Exception:** If this is intended, add `{"rule":"checkstyle/JavadocMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/javadocmethod.html)

<a id="checkstyle-javadocparagraph"></a>

### `checkstyle/JavadocParagraph`

Javadoc paragraph.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Separate paragraphs with an empty Javadoc line and start each following one with \<p> glued to its first word, as in \<p>Text.
- **Exception:** If this is intended, add `{"rule":"checkstyle/JavadocParagraph","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/javadocparagraph.html)

<a id="checkstyle-javadoctagcontinuationindentation"></a>

### `checkstyle/JavadocTagContinuationIndentation`

Javadoc tag continuation indentation.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/JavadocTagContinuationIndentation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/javadoctagcontinuationindentation.html)

<a id="checkstyle-lambdaparametername"></a>

### `checkstyle/LambdaParameterName`

Lambda parameter name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name the lambda parameter lowerCamelCase, one letter or two or more characters with a lowercase or digit second, such as o or order.
- **Exception:** If this is intended, add `{"rule":"checkstyle/LambdaParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/lambdaparametername.html)

<a id="checkstyle-leftcurlyeol"></a>

### `checkstyle/LeftCurlyEol`

Left curly.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/LeftCurlyEol","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/blocks/leftcurly.html)

<a id="checkstyle-leftcurlynl"></a>

### `checkstyle/LeftCurlyNl`

Left curly.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/LeftCurlyNl","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/blocks/leftcurly.html)

<a id="checkstyle-linelength"></a>

### `checkstyle/LineLength`

Line length.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run google-java-format first; it wraps code, strings and comments. Then shorten what remains, such as a long name or a text-block line.
- **Exception:** If this is intended, add `{"rule":"checkstyle/LineLength","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/sizes/linelength.html)

<a id="checkstyle-localvariablename"></a>

### `checkstyle/LocalVariableName`

Local variable name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name local variables lowerCamelCase, one letter or two or more characters with a lowercase or digit second: totalCents, not tC or total_cents.
- **Exception:** If this is intended, add `{"rule":"checkstyle/LocalVariableName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/localvariablename.html)

<a id="checkstyle-membername"></a>

### `checkstyle/MemberName`

Member name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name fields lowerCamelCase with at least two characters and a lowercase or digit second: userId, not uId, x or user_id.
- **Exception:** If this is intended, add `{"rule":"checkstyle/MemberName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/membername.html)

<a id="checkstyle-methodname"></a>

### `checkstyle/MethodName`

Method name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name methods lowerCamelCase with a lowercase or digit second character (xCoord fails, total passes); @Test methods may join such parts with underscores.
- **Exception:** If this is intended, add `{"rule":"checkstyle/MethodName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/methodname.html)

<a id="checkstyle-methodparampad"></a>

### `checkstyle/MethodParamPad`

Method param pad.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/MethodParamPad","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/methodparampad.html)

<a id="checkstyle-methodtypeparametername"></a>

### `checkstyle/MethodTypeParameterName`

Method type parameter name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name method type parameters with one capital letter and an optional digit (T, K2), or a capitalized name ending in T (ResultT).
- **Exception:** If this is intended, add `{"rule":"checkstyle/MethodTypeParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/methodtypeparametername.html)

<a id="checkstyle-missingjavadocmethod"></a>

### `checkstyle/MissingJavadocMethod`

Missing javadoc method.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Add a Javadoc comment whose first sentence says what the method does.
- **Exception:** If this is intended, add `{"rule":"checkstyle/MissingJavadocMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/missingjavadocmethod.html)

<a id="checkstyle-missingjavadoctype"></a>

### `checkstyle/MissingJavadocType`

Missing javadoc type.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Add a Javadoc comment on the type whose first sentence says what it represents.
- **Exception:** If this is intended, add `{"rule":"checkstyle/MissingJavadocType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/missingjavadoctype.html)

<a id="checkstyle-missingswitchdefault"></a>

### `checkstyle/MissingSwitchDefault`

Missing switch default.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Add a default branch that throws IllegalStateException, or make the switch an exhaustive switch expression over a sealed interface or enum.
- **Exception:** If this is intended, add `{"rule":"checkstyle/MissingSwitchDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/missingswitchdefault.html)

<a id="checkstyle-modifierorder"></a>

### `checkstyle/ModifierOrder`

Modifier order.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Put every annotation before the modifier keywords, @Deprecated public void x(), not public @Deprecated; google-java-format then sorts the keywords.
- **Exception:** If this is intended, add `{"rule":"checkstyle/ModifierOrder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/modifier/modifierorder.html)

<a id="checkstyle-multiplevariabledeclarations"></a>

### `checkstyle/MultipleVariableDeclarations`

Multiple variable declarations.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Declare one variable per statement: int a; then int b;, never int a, b;.
- **Exception:** If this is intended, add `{"rule":"checkstyle/MultipleVariableDeclarations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/multiplevariabledeclarations.html)

<a id="checkstyle-needbraces"></a>

### `checkstyle/NeedBraces`

Need braces.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Put braces around the body of every if, else, for, while and do, even a single statement.
- **Exception:** If this is intended, add `{"rule":"checkstyle/NeedBraces","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/blocks/needbraces.html)

<a id="checkstyle-nofinalizer"></a>

### `checkstyle/NoFinalizer`

No finalizer.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Delete finalize(); release resources with try-with-resources on an AutoCloseable, or register a java.lang.ref.Cleaner.
- **Exception:** If this is intended, add `{"rule":"checkstyle/NoFinalizer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/nofinalizer.html)

<a id="checkstyle-nolinewrap"></a>

### `checkstyle/NoLineWrap`

No line wrap.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/NoLineWrap","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/nolinewrap.html)

<a id="checkstyle-nonemptyatclausedescription"></a>

### `checkstyle/NonEmptyAtclauseDescription`

Non empty atclause description.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Write a description after every Javadoc block tag, such as @param name the customer id, or remove the tag.
- **Exception:** If this is intended, add `{"rule":"checkstyle/NonEmptyAtclauseDescription","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/nonemptyatclausedescription.html)

<a id="checkstyle-nowhitespacebefore"></a>

### `checkstyle/NoWhitespaceBefore`

No whitespace before.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/NoWhitespaceBefore","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/nowhitespacebefore.html)

<a id="checkstyle-nowhitespacebeforecasedefaultcolon"></a>

### `checkstyle/NoWhitespaceBeforeCaseDefaultColon`

No whitespace before case default colon.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/NoWhitespaceBeforeCaseDefaultColon","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/nowhitespacebeforecasedefaultcolon.html)

<a id="checkstyle-onestatementperline"></a>

### `checkstyle/OneStatementPerLine`

One statement per line.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/OneStatementPerLine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/onestatementperline.html)

<a id="checkstyle-onetoplevelclass"></a>

### `checkstyle/OneTopLevelClass`

One top level class.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Keep one top-level type per file; move the extra types to files of their own, or nest them inside the main type.
- **Exception:** If this is intended, add `{"rule":"checkstyle/OneTopLevelClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/design/onetoplevelclass.html)

<a id="checkstyle-operatorwrap"></a>

### `checkstyle/OperatorWrap`

Operator wrap.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/OperatorWrap","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/operatorwrap.html)

<a id="checkstyle-outertypefilename"></a>

### `checkstyle/OuterTypeFilename`

Outer type filename.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Name the file after its top-level type, so class OrderService lives in OrderService.java.
- **Exception:** If this is intended, add `{"rule":"checkstyle/OuterTypeFilename","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/misc/outertypefilename.html)

<a id="checkstyle-overloadmethodsdeclarationorder"></a>

### `checkstyle/OverloadMethodsDeclarationOrder`

Overload methods declaration order.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Declare all overloads of a method name next to each other, with no other method between them.
- **Exception:** If this is intended, add `{"rule":"checkstyle/OverloadMethodsDeclarationOrder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/overloadmethodsdeclarationorder.html)

<a id="checkstyle-packagename"></a>

### `checkstyle/PackageName`

Package name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name packages in lowercase letters only, no underscores or uppercase; digits are allowed after the first letter of a later segment: com.example.orders2.
- **Exception:** If this is intended, add `{"rule":"checkstyle/PackageName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/packagename.html)

<a id="checkstyle-parametername"></a>

### `checkstyle/ParameterName`

Parameter name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name parameters lowerCamelCase, one letter or two or more characters with a lowercase or digit second: unitPrice, not uP or unit_price.
- **Exception:** If this is intended, add `{"rule":"checkstyle/ParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/parametername.html)

<a id="checkstyle-parenpad"></a>

### `checkstyle/ParenPad`

Paren pad.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/ParenPad","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/parenpad.html)

<a id="checkstyle-patternvariablename"></a>

### `checkstyle/PatternVariableName`

Pattern variable name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name pattern variables lowerCamelCase, one letter or two or more characters with a lowercase or digit second, as in if (o instanceof Order order).
- **Exception:** If this is intended, add `{"rule":"checkstyle/PatternVariableName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/patternvariablename.html)

<a id="checkstyle-recordcomponentname"></a>

### `checkstyle/RecordComponentName`

Record component name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name record components lowerCamelCase, one letter or two or more characters with a lowercase or digit second: record Order(String customerId).
- **Exception:** If this is intended, add `{"rule":"checkstyle/RecordComponentName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/recordcomponentname.html)

<a id="checkstyle-recordtypeparametername"></a>

### `checkstyle/RecordTypeParameterName`

Record type parameter name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name record type parameters with one capital letter and an optional digit (T, K2), or a capitalized name ending in T (ValueT).
- **Exception:** If this is intended, add `{"rule":"checkstyle/RecordTypeParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/recordtypeparametername.html)

<a id="checkstyle-regexpsinglelinejava"></a>

### `checkstyle/RegexpSinglelineJava`

Regexp singleline java.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Write an empty block as {} with no space inside; if the match is inside a string or comment, remove the spaces between the braces there.
- **Exception:** If this is intended, add `{"rule":"checkstyle/RegexpSinglelineJava","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/regexp/regexpsinglelinejava.html)

<a id="checkstyle-requireemptylinebeforeblocktaggroup"></a>

### `checkstyle/RequireEmptyLineBeforeBlockTagGroup`

Require empty line before block tag group.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/RequireEmptyLineBeforeBlockTagGroup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/requireemptylinebeforeblocktaggroup.html)

<a id="checkstyle-rightcurlyalone"></a>

### `checkstyle/RightCurlyAlone`

Right curly.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/RightCurlyAlone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/blocks/rightcurly.html)

<a id="checkstyle-rightcurlysame"></a>

### `checkstyle/RightCurlySame`

Right curly.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/RightCurlySame","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/blocks/rightcurly.html)

<a id="checkstyle-separatorwraparraydeclarator"></a>

### `checkstyle/SeparatorWrapArrayDeclarator`

Separator wrap.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/SeparatorWrapArrayDeclarator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/separatorwrap.html)

<a id="checkstyle-separatorwrapcomma"></a>

### `checkstyle/SeparatorWrapComma`

Separator wrap.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/SeparatorWrapComma","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/separatorwrap.html)

<a id="checkstyle-separatorwrapdot"></a>

### `checkstyle/SeparatorWrapDot`

Separator wrap.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/SeparatorWrapDot","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/separatorwrap.html)

<a id="checkstyle-separatorwrapellipsis"></a>

### `checkstyle/SeparatorWrapEllipsis`

Separator wrap.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/SeparatorWrapEllipsis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/separatorwrap.html)

<a id="checkstyle-separatorwrapmethodref"></a>

### `checkstyle/SeparatorWrapMethodRef`

Separator wrap.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/SeparatorWrapMethodRef","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/separatorwrap.html)

<a id="checkstyle-singlelinejavadoc"></a>

### `checkstyle/SingleLineJavadoc`

Single line javadoc.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/SingleLineJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/singlelinejavadoc.html)

<a id="checkstyle-summaryjavadoc"></a>

### `checkstyle/SummaryJavadoc`

Summary javadoc.

- **Why it is on:** Google style asks for Javadoc in the shape it prescribes, and Checkstyle's Google checks report a missing or malformed comment; the formatter does not write Javadoc.
- **Allowed form:** Start the Javadoc with a one-sentence summary ending in a period, and do not open with @return, This method returns or A {@code X} is a.
- **Exception:** If this is intended, add `{"rule":"checkstyle/SummaryJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/javadoc/summaryjavadoc.html)

<a id="checkstyle-typename"></a>

### `checkstyle/TypeName`

Type name.

- **Why it is on:** Google style fixes one naming form for each kind of name, so a name reads the same everywhere; the formatter does not rename.
- **Allowed form:** Name classes, interfaces, enums, records and annotations UpperCamelCase with no underscores: OrderService, HttpClient.
- **Exception:** If this is intended, add `{"rule":"checkstyle/TypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/naming/typename.html)

<a id="checkstyle-unusedimports"></a>

### `checkstyle/UnusedImports`

Unused imports.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Remove the import, or use the class it names.
- **Exception:** If this is intended, add `{"rule":"checkstyle/UnusedImports","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/imports/unusedimports.html)

<a id="checkstyle-upperell"></a>

### `checkstyle/UpperEll`

Upper ell.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Write long literals with an uppercase L, as in 100L, never 100l.
- **Exception:** If this is intended, add `{"rule":"checkstyle/UpperEll","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/misc/upperell.html)

<a id="checkstyle-variabledeclarationusagedistance"></a>

### `checkstyle/VariableDeclarationUsageDistance`

Variable declaration usage distance.

- **Why it is on:** Google style bans a coding form that has a clearer equivalent, and Checkstyle's Google checks report it.
- **Allowed form:** Declare the local right before its first use, at most three statements earlier, or move the statements in between above it.
- **Exception:** If this is intended, add `{"rule":"checkstyle/VariableDeclarationUsageDistance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/coding/variabledeclarationusagedistance.html)

<a id="checkstyle-whitespaceafter"></a>

### `checkstyle/WhitespaceAfter`

Whitespace after.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/WhitespaceAfter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/whitespaceafter.html)

<a id="checkstyle-whitespacearound"></a>

### `checkstyle/WhitespaceAround`

Whitespace around.

- **Why it is on:** Google style fixes one layout. A layout finding means the file is not formatted, and the project's formatter is the allowed form.
- **Allowed form:** Run the formatter of the project (`google-java-format`, `google-java-format --aosp`, `palantir-java-format`) on the file; with no formatter, fix the layout by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"checkstyle/WhitespaceAround","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [Checkstyle check documentation](https://checkstyle.org/checks/whitespace/whitespacearound.html)
