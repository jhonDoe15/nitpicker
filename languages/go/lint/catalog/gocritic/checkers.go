package gocritic

// Enabled are the go-critic checkers this preset runs; docs/go-preset.md gives each one's form.
var Enabled = []string{
	"appendAssign", "appendCombine", "argOrder", "assignOp", "badCall", "badCond", "badLock",
	"badRegexp", "badSyncOnceFunc", "boolExprSimplify", "captLocal", "codegenComment",
	"commentedOutCode", "commentedOutImport", "deferUnlambda", "deprecatedComment", "docStub",
	"dupArg", "dupCase", "dupOption", "elseif", "emptyDecl", "emptyFallthrough",
	"emptyStringTest", "equalFold", "evalOrder", "exitAfterDefer", "exposedSyncMutex",
	"filepathJoin", "flagDeref", "flagName", "hexLiteral", "httpNoBody", "ifElseChain",
	"indexAlloc", "initClause", "mapKey", "methodExprCall", "newDeref", "nilValReturn",
	"octalLiteral", "offBy1", "preferDecodeRune", "preferFilepathJoin", "preferFprint",
	"preferStringWriter", "preferWriteByte", "ptrToRefParam", "rangeAppendAll", "redundantSprint",
	"regexpMust", "regexpPattern", "regexpSimplify", "returnAfterHttpError",
	"sloppyLen", "sloppyReassign", "sortSlice", "sqlQuery", "stringConcatSimplify",
	"stringsCompare", "stringXbytes", "switchTrue", "syncMapLoadAndDelete",
	"truncateCmp", "typeAssertChain", "typeDefFirst", "typeUnparen",
	"uncheckedInlineErr", "underef", "unlabelStmt", "unlambda", "unnecessaryBlock",
	"unnecessaryDefer", "unslice", "valSwap", "weakCond", "wrapperFunc", "zeroByteRepeat",
}

// Disabled are the go-critic checkers left out; docs/go-preset.md gives each one's reason.
var Disabled = []string{
	"badSorting", "builtinShadow", "builtinShadowDecl", "caseOrder", "commentFormatting",
	"defaultCaseOrder", "deferInLoop", "dupBranchBody", "dupImport", "dupSubExpr",
	"dynamicFmtString", "externalErrorReassign", "hugeParam", "importShadow", "nestingReduce",
	"paramTypeCombine", "rangeExprCopy", "rangeValCopy", "ruleguard", "singleCaseSwitch", "sliceClear",
	"sloppyTypeAssert", "sprintfQuotedString", "timeExprSimplify", "todoCommentWithoutDetail",
	"tooManyResultsChecker",
	"typeSwitchVar", "unnamedResult", "whyNoLint", "yodaStyleExpr",
}
