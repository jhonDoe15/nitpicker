package mutants

import (
	"bytes"
	"go/ast"
	"go/token"
)

type Mutant struct {
	File        string `json:"file"`
	Line        int    `json:"line"`
	EndLine     int    `json:"endLine"`
	Column      int    `json:"column"`
	Start       int    `json:"start"`
	End         int    `json:"end"`
	Operator    string `json:"operator"`
	Original    string `json:"original"`
	Replacement string `json:"replacement"`
	Function    string `json:"function,omitempty"`
}

type generator struct {
	fileSet  *token.FileSet
	path     string
	source   []byte
	wanted   func(line int) bool
	function string
	mutants  []Mutant
}

var binaryReplacements = map[token.Token][]token.Token{
	token.ADD:     {token.SUB},
	token.SUB:     {token.ADD},
	token.MUL:     {token.QUO},
	token.QUO:     {token.MUL},
	token.REM:     {token.MUL},
	token.EQL:     {token.NEQ},
	token.NEQ:     {token.EQL},
	token.LSS:     {token.LEQ, token.GEQ},
	token.LEQ:     {token.LSS, token.GTR},
	token.GTR:     {token.GEQ, token.LEQ},
	token.GEQ:     {token.GTR, token.LSS},
	token.LAND:    {token.LOR},
	token.LOR:     {token.LAND},
	token.AND:     {token.OR},
	token.OR:      {token.AND},
	token.XOR:     {token.AND},
	token.SHL:     {token.SHR},
	token.SHR:     {token.SHL},
	token.AND_NOT: {token.AND},
}

var assignReplacements = map[token.Token]token.Token{
	token.ADD_ASSIGN: token.SUB_ASSIGN,
	token.SUB_ASSIGN: token.ADD_ASSIGN,
	token.MUL_ASSIGN: token.QUO_ASSIGN,
	token.QUO_ASSIGN: token.MUL_ASSIGN,
	token.REM_ASSIGN: token.MUL_ASSIGN,
	token.AND_ASSIGN: token.OR_ASSIGN,
	token.OR_ASSIGN:  token.AND_ASSIGN,
	token.SHL_ASSIGN: token.SHR_ASSIGN,
	token.SHR_ASSIGN: token.SHL_ASSIGN,
}

var operatorNames = map[token.Token]string{
	token.ADD: "ArithmeticOperator", token.SUB: "ArithmeticOperator", token.MUL: "ArithmeticOperator",
	token.QUO: "ArithmeticOperator", token.REM: "ArithmeticOperator",
	token.EQL: "EqualityOperator", token.NEQ: "EqualityOperator", token.LSS: "EqualityOperator",
	token.LEQ: "EqualityOperator", token.GTR: "EqualityOperator", token.GEQ: "EqualityOperator",
	token.LAND: "LogicalOperator", token.LOR: "LogicalOperator",
	token.AND: "BitwiseOperator", token.OR: "BitwiseOperator", token.XOR: "BitwiseOperator",
	token.SHL: "BitwiseOperator", token.SHR: "BitwiseOperator", token.AND_NOT: "BitwiseOperator",
}

func Generate(fileSet *token.FileSet, path string, file *ast.File, source []byte, wanted func(int) bool, nameOf func(*ast.FuncDecl) string) []Mutant {
	g := &generator{fileSet: fileSet, path: path, source: source, wanted: wanted}
	skipped := map[ast.Node]bool{}
	for _, spec := range file.Imports {
		skipped[spec.Path] = true
	}
	for _, declaration := range file.Decls {
		g.function = ""
		if function, ok := declaration.(*ast.FuncDecl); ok {
			g.function = nameOf(function)
		}
		ast.Inspect(declaration, func(node ast.Node) bool {
			for _, typeOnly := range typeOnlyParts(node) {
				skip(skipped, typeOnly)
			}
			if node != nil && !skipped[node] {
				g.visit(node)
			}
			return true
		})
	}
	return g.mutants
}

func typeOnlyParts(node ast.Node) []ast.Node {
	switch typed := node.(type) {
	case *ast.Field:
		if typed.Tag != nil {
			return []ast.Node{typed.Tag}
		}
	case *ast.FuncType:
		if typed.TypeParams != nil {
			return []ast.Node{typed.TypeParams}
		}
	case *ast.TypeSpec:
		if typed.TypeParams != nil {
			return []ast.Node{typed.TypeParams}
		}
	case *ast.InterfaceType:
		return []ast.Node{typed.Methods}
	case *ast.ArrayType:
		if typed.Len != nil {
			return []ast.Node{typed.Len}
		}
	}
	return nil
}

func skip(skipped map[ast.Node]bool, root ast.Node) {
	ast.Inspect(root, func(node ast.Node) bool {
		if node != nil {
			skipped[node] = true
		}
		return true
	})
}

func (g *generator) anyWanted(first, last int) bool {
	for line := first; line <= last; line++ {
		if g.wanted(line) {
			return true
		}
	}
	return false
}

func (g *generator) add(operator string, start, end token.Pos, replacement string) {
	position := g.fileSet.PositionFor(start, false)
	last := g.fileSet.PositionFor(end, false)
	if !g.anyWanted(position.Line, last.Line) {
		return
	}
	finish := last.Offset
	original := g.source[position.Offset:finish]
	if string(original) == replacement || (len(original) > 0 && original[0] == '`' && bytes.IndexByte(original, '\r') >= 0) {
		return
	}
	g.mutants = append(g.mutants, Mutant{
		File: g.path, Line: position.Line, EndLine: last.Line, Column: position.Column,
		Start: position.Offset, End: finish, Operator: operator,
		Original: string(g.source[position.Offset:finish]), Replacement: replacement,
		Function: g.function,
	})
}

func (g *generator) visit(node ast.Node) {
	switch typed := node.(type) {
	case *ast.BinaryExpr:
		end := typed.OpPos + token.Pos(len(typed.Op.String()))
		for _, replacement := range binaryReplacements[typed.Op] {
			g.add(operatorNames[typed.Op], typed.OpPos, end, replacement.String())
		}
	case *ast.UnaryExpr:
		if typed.Op == token.SUB || typed.Op == token.NOT || typed.Op == token.XOR {
			g.add("UnaryOperator", typed.OpPos, typed.OpPos+1, "")
		}
	case *ast.IncDecStmt:
		replacement := token.INC
		if typed.Tok == token.INC {
			replacement = token.DEC
		}
		g.add("UpdateOperator", typed.TokPos, typed.TokPos+2, replacement.String())
	case *ast.AssignStmt:
		if replacement, ok := assignReplacements[typed.Tok]; ok {
			g.add("AssignmentOperator", typed.TokPos, typed.TokPos+token.Pos(len(typed.Tok.String())), replacement.String())
		}
	case *ast.Ident:
		g.boolean(typed)
	case *ast.BasicLit:
		if typed.Kind == token.STRING && len(typed.Value) > 2 {
			g.add("StringLiteral", typed.Pos(), typed.End(), `""`)
		}
	case *ast.IfStmt:
		g.add("ConditionalExpression", typed.Cond.Pos(), typed.Cond.End(), "true")
		g.add("ConditionalExpression", typed.Cond.Pos(), typed.Cond.End(), "false")
	case *ast.ForStmt:
		if typed.Cond != nil {
			g.add("ConditionalExpression", typed.Cond.Pos(), typed.Cond.End(), "false")
		}
	case *ast.ExprStmt:
		if _, ok := typed.X.(*ast.CallExpr); ok {
			g.add("RemovedCall", typed.Pos(), typed.End(), "")
		}
	case *ast.BranchStmt:
		g.loopControl(typed)
	case *ast.CaseClause:
		if len(typed.Body) > 0 {
			g.add("SwitchCase", typed.Colon+1, typed.End(), "")
		}
	}
}

func (g *generator) boolean(identifier *ast.Ident) {
	switch identifier.Name {
	case "true":
		g.add("BooleanLiteral", identifier.Pos(), identifier.End(), "false")
	case "false":
		g.add("BooleanLiteral", identifier.Pos(), identifier.End(), "true")
	}
}

func (g *generator) loopControl(statement *ast.BranchStmt) {
	if statement.Label != nil {
		return
	}
	switch statement.Tok {
	case token.BREAK:
		g.add("LoopControl", statement.Pos(), statement.End(), "continue")
	case token.CONTINUE:
		g.add("LoopControl", statement.Pos(), statement.End(), "break")
	}
}
