package main

import (
	"go/ast"
	"go/doc/comment"
	"go/token"
	"strings"
)

type DocComment struct {
	File      string   `json:"file"`
	Line      int      `json:"line"`
	Name      string   `json:"name"`
	Qualifier string   `json:"qualifier,omitempty"`
	Lines     []string `json:"lines"`
	Detailed  bool     `json:"detailed,omitempty"`
}

const deprecatedPrefix = "Deprecated:"

type docTarget struct {
	group     *ast.CommentGroup
	name      string
	qualifier string
}

func plainText(spans []comment.Text) string {
	var text strings.Builder
	for _, span := range spans {
		switch typed := span.(type) {
		case comment.Plain:
			text.WriteString(string(typed))
		case comment.Italic:
			text.WriteString(string(typed))
		case *comment.Link:
			text.WriteString(plainText(typed.Text))
		case *comment.DocLink:
			text.WriteString(plainText(typed.Text))
		}
	}
	return text.String()
}

type docText struct {
	lines    []string
	detailed bool
}

func (doc *docText) addProse(text string) {
	for _, line := range strings.Split(text, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			doc.lines = append(doc.lines, trimmed)
		}
	}
}

func (doc *docText) addParagraph(text string) {
	if rest, found := strings.CutPrefix(text, deprecatedPrefix); found {
		doc.detailed = doc.detailed || strings.TrimSpace(rest) != ""
		return
	}
	doc.addProse(text)
}

func (doc *docText) addBlock(block comment.Block) {
	switch typed := block.(type) {
	case *comment.Paragraph:
		doc.addParagraph(plainText(typed.Text))
	case *comment.Heading:
		doc.addProse(plainText(typed.Text))
	case *comment.List:
		for _, item := range typed.Items {
			for _, content := range item.Content {
				doc.addBlock(content)
			}
		}
	case *comment.Code:
		doc.detailed = doc.detailed || strings.TrimSpace(typed.Text) != ""
	}
}

func docSource(group *ast.CommentGroup) string {
	text := group.Text()
	if !strings.HasPrefix(group.List[0].Text, "/*") {
		return text
	}
	lines := strings.Split(text, "\n")
	for index, line := range lines {
		lines[index] = strings.TrimSpace(line)
	}
	return strings.Join(lines, "\n")
}

func declaredNames(names []*ast.Ident) string {
	kept := []string{}
	for _, name := range names {
		if name.Name != "_" {
			kept = append(kept, name.Name)
		}
	}
	return strings.Join(kept, ", ")
}

func parseDocText(group *ast.CommentGroup) docText {
	var parser comment.Parser
	var doc docText
	for _, block := range parser.Parse(docSource(group)).Content {
		doc.addBlock(block)
	}
	return doc
}

func fieldTargets(owner string, fields *ast.FieldList) []docTarget {
	targets := []docTarget{}
	for _, field := range fields.List {
		name := declaredNames(field.Names)
		if field.Doc == nil || name == "" {
			continue
		}
		targets = append(targets, docTarget{group: field.Doc, name: name, qualifier: owner + "." + name})
	}
	return targets
}

func memberTargets(spec *ast.TypeSpec) []docTarget {
	switch typed := spec.Type.(type) {
	case *ast.StructType:
		return fieldTargets(spec.Name.Name, typed.Fields)
	case *ast.InterfaceType:
		return fieldTargets(spec.Name.Name, typed.Methods)
	}
	return nil
}

func specTargets(declaration *ast.GenDecl) []docTarget {
	targets := []docTarget{}
	for _, spec := range declaration.Specs {
		var doc *ast.CommentGroup
		var name string
		var members []docTarget
		switch typed := spec.(type) {
		case *ast.TypeSpec:
			doc, name, members = typed.Doc, typed.Name.Name, memberTargets(typed)
		case *ast.ValueSpec:
			doc, name = typed.Doc, declaredNames(typed.Names)
		default:
			continue
		}
		if doc == nil && !declaration.Lparen.IsValid() {
			doc = declaration.Doc
		}
		if doc != nil && name != "_" && name != "" {
			targets = append(targets, docTarget{group: doc, name: name})
		}
		targets = append(targets, members...)
	}
	return targets
}

func functionTarget(function *ast.FuncDecl) []docTarget {
	if function.Doc == nil || function.Name.Name == "_" {
		return nil
	}
	receiver := receiverName(function)
	if receiver == "" {
		return []docTarget{{group: function.Doc, name: function.Name.Name}}
	}
	return []docTarget{{group: function.Doc, name: function.Name.Name, qualifier: receiver + "." + function.Name.Name}}
}

func docTargets(syntax *ast.File) []docTarget {
	targets := []docTarget{}
	for _, declaration := range syntax.Decls {
		switch typed := declaration.(type) {
		case *ast.FuncDecl:
			targets = append(targets, functionTarget(typed)...)
		case *ast.GenDecl:
			targets = append(targets, specTargets(typed)...)
		}
	}
	return targets
}

func fileDocComments(fileSet *token.FileSet, file parsedFile) []DocComment {
	comments := []DocComment{}
	for _, target := range docTargets(file.syntax) {
		doc := parseDocText(target.group)
		if len(doc.lines) == 0 {
			continue
		}
		comments = append(comments, DocComment{
			File: file.path, Line: fileSet.Position(target.group.Pos()).Line, Name: target.name,
			Qualifier: target.qualifier, Lines: doc.lines, Detailed: doc.detailed,
		})
	}
	return comments
}
