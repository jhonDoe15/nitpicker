package schema

import (
	"fmt"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

const gormPath = "gorm.io/gorm"

type gormRelation struct {
	holder, child *types.Named
	field         *types.Var
	key           modelField
}

func gormFindings(pass *analysis.Pass) []finding {
	var found []finding
	for _, model := range gormModels(pass) {
		for _, relation := range modelRelations(model) {
			if covered(relation.child, relation.key) {
				continue
			}
			found = append(found, gormFinding(pass, relation))
		}
	}
	return found
}

func gormModels(pass *analysis.Pass) []*types.Named {
	var models []*types.Named
	scope := pass.Pkg.Scope()
	for _, name := range scope.Names() {
		object, isType := scope.Lookup(name).(*types.TypeName)
		if !isType || inTestFile(pass, object.Pos()) {
			continue
		}
		named, ok := object.Type().(*types.Named)
		if !ok {
			continue
		}
		if structure, isStruct := named.Underlying().(*types.Struct); isStruct && isGormModel(structure, 0) {
			models = append(models, named)
		}
	}
	return models
}

func isGormModel(structure *types.Struct, depth int) bool {
	for index := range structure.NumFields() {
		field := structure.Field(index)
		if _, tagged := lookupGorm(structure.Tag(index)); tagged || support.IsNamed(field.Type(), gormPath, "Model") {
			return true
		}
		inner, embedded := types.Unalias(support.Deref(field.Type())).Underlying().(*types.Struct)
		if field.Anonymous() && embedded && depth < maxEmbedding && isGormModel(inner, depth+1) {
			return true
		}
	}
	return false
}

func modelRelations(model *types.Named) []gormRelation {
	var relations []gormRelation
	for _, field := range modelFields(model) {
		target, many := relationTarget(field)
		if target == nil || field.settings.has("POLYMORPHIC", "POLYMORPHICTYPE", "POLYMORPHICID", "MANY2MANY") ||
			field.settings["CONSTRAINT"] == "-" {
			continue
		}
		if relation, ok := guessRelation(model, target, field, many); ok {
			relations = append(relations, relation)
		}
	}
	return relations
}

func guessRelation(model, target *types.Named, field modelField, many bool) (gormRelation, bool) {
	belongsFirst := !many && (field.settings.has("BELONGSTO") || types.Identical(model, target))
	if !belongsFirst {
		if key, ok := foreignKeyField(target, model, field, model.Obj().Name()); ok {
			return gormRelation{holder: model, child: target, field: field.variable, key: key}, true
		}
	}
	if many {
		return gormRelation{}, false
	}
	if key, ok := foreignKeyField(model, target, field, field.variable.Name()); ok {
		return gormRelation{holder: model, child: model, field: field.variable, key: key}, true
	}
	return gormRelation{}, false
}

func foreignKeyField(holder, referenced *types.Named, field modelField, prefix string) (modelField, bool) {
	fields := modelFields(holder)
	if names := field.settings["FOREIGNKEY"]; names != "" {
		return lookupField(fields, names)
	}
	primary, ok := primaryField(referenced, field.settings["REFERENCES"])
	if !ok {
		return modelField{}, false
	}
	for _, candidate := range []string{prefix + primary, prefix + "ID", prefix + "Id"} {
		if found, exists := lookupField(fields, candidate); exists {
			return found, true
		}
	}
	return modelField{}, false
}

func primaryField(model *types.Named, references string) (string, bool) {
	if references != "" {
		return references, !strings.Contains(references, ",")
	}
	var primary []string
	identifier := false
	for _, field := range modelFields(model) {
		if field.primary() {
			primary = append(primary, field.variable.Name())
		}
		identifier = identifier || field.variable.Name() == "ID"
	}
	switch {
	case len(primary) == 1:
		return primary[0], true
	case len(primary) == 0 && identifier:
		return "ID", true
	}
	return "", false
}

func lookupField(fields []modelField, name string) (modelField, bool) {
	if strings.Contains(name, ",") {
		return modelField{}, false
	}
	name = strings.TrimSpace(name)
	for _, field := range fields {
		if field.variable.Name() == name || field.column() == name {
			return field, true
		}
	}
	return modelField{}, false
}

func gormFinding(pass *analysis.Pass, relation gormRelation) finding {
	child := relation.child.Obj().Name()
	key := child + "." + relation.key.variable.Name()
	pos := relation.field.Pos()
	if relation.key.variable.Pkg() == pass.Pkg {
		pos = relation.key.variable.Pos()
	}
	return finding{pos: pos, message: fmt.Sprintf(
		"`%s` holds the foreign key of the GORM relation `%s.%s`, and no index, unique constraint or primary key "+
			"of `%s` starts with it: add `gorm:\"index\"` to `%s`, or put it first in a composite index",
		key, relation.holder.Obj().Name(), relation.field.Name(), child, key)}
}
