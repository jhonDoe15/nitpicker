package gocritic

// Enabled are the go-critic checkers this preset runs; docs/go-preset.md gives each one's form.
var Enabled = []string{
	"appendAssign", "appendCombine", "argOrder", "assignOp", "badCall", "badCond", "badLock",
	"badRegexp", "badSyncOnceFunc", "boolExprSimplify", "captLocal", "codegenComment", "commentedOutCode", "commentedOutImport", "deferUnlambda",
	"deprecatedComment", "docStub", "dupArg", "dupCase", "dupOption", "elseif",
	"emptyDecl", "emptyStringTest", "equalFold", "evalOrder", "exitAfterDefer",
	"exposedSyncMutex", "filepathJoin", "flagDeref", "flagName", "hexLiteral", "httpNoBody",
	"ifElseChain", "indexAlloc", "initClause", "mapKey", "methodExprCall", "newDeref",
	"nilValReturn", "octalLiteral", "offBy1", "preferDecodeRune", "preferFilepathJoin",
	"preferStringWriter", "preferWriteByte", "ptrToRefParam", "rangeAppendAll",
	"redundantSprint", "regexpMust", "regexpPattern", "regexpSimplify", "returnAfterHttpError",
	"singleCaseSwitch", "sloppyLen", "sloppyReassign", "sortSlice",
	"sprintfQuotedString", "sqlQuery", "stringConcatSimplify", "stringXbytes", "stringsCompare",
	"switchTrue", "syncMapLoadAndDelete", "todoCommentWithoutDetail", "truncateCmp",
	"typeAssertChain", "typeDefFirst", "typeUnparen", "uncheckedInlineErr",
	"underef", "unlabelStmt", "unlambda", "unnecessaryBlock", "unnecessaryDefer", "unslice",
	"valSwap", "weakCond", "wrapperFunc", "zeroByteRepeat",
}

// Disabled are the go-critic checkers left out; docs/go-preset.md gives each one's reason.
var Disabled = []string{
	"badSorting", "builtinShadow", "builtinShadowDecl", "caseOrder", "commentFormatting", "defaultCaseOrder", "deferInLoop",
	"dupBranchBody", "dupImport", "dupSubExpr", "dynamicFmtString", "emptyFallthrough", "externalErrorReassign",
	"hugeParam", "importShadow", "nestingReduce", "paramTypeCombine", "preferFprint", "rangeExprCopy",
	"rangeValCopy", "ruleguard", "sliceClear", "sloppyTypeAssert", "timeExprSimplify", "tooManyResultsChecker",
	"typeSwitchVar", "unnamedResult", "whyNoLint", "yodaStyleExpr",
}

var parameters = map[string]map[string]any{
	"captLocal": {"paramsOnly": false},
}
