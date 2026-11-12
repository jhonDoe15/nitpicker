package schema

import (
	"cmp"
	"go/types"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"unicode"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
)

type settings map[string]string

type modelField struct {
	variable *types.Var
	settings settings
	raw      string
	order    int
}

type indexPart struct {
	field    modelField
	priority int
	partial  bool
}

const maxEmbedding = 8

func lookupGorm(tag string) (string, bool) {
	return reflect.StructTag(tag).Lookup("gorm")
}

func parseSettings(tag string) settings {
	parsed := settings{}
	for _, part := range strings.Split(tag, ";") {
		key, value, found := strings.Cut(part, ":")
		key = strings.ToUpper(strings.TrimSpace(key))
		if key == "" {
			continue
		}
		if !found {
			value = key
		}
		parsed[key] = value
	}
	return parsed
}

func (each settings) has(keys ...string) bool {
	for _, key := range keys {
		if _, ok := each[key]; ok {
			return true
		}
	}
	return false
}

func (each settings) truthy(key string) bool {
	value, ok := each[key]
	return ok && !strings.EqualFold(value, "false")
}

func modelFields(model *types.Named) []modelField {
	structure, _ := model.Underlying().(*types.Struct)
	var fields []modelField
	collectFields(structure, &fields, 0)
	return fields
}

func collectFields(structure *types.Struct, fields *[]modelField, depth int) {
	if structure == nil || depth > maxEmbedding {
		return
	}
	for index := range structure.NumFields() {
		variable := structure.Field(index)
		raw, _ := lookupGorm(structure.Tag(index))
		parsed := parseSettings(raw)
		if parsed.has("-") || !variable.Exported() {
			continue
		}
		if inner, ok := embeddedStruct(variable, parsed); ok {
			collectFields(inner, fields, depth+1)
			continue
		}
		*fields = append(*fields, modelField{variable: variable, settings: parsed, raw: raw, order: len(*fields)})
	}
}

func embeddedStruct(variable *types.Var, parsed settings) (*types.Struct, bool) {
	if !variable.Anonymous() && !parsed.has("EMBEDDED") {
		return nil, false
	}
	named, ok := types.Unalias(support.Deref(variable.Type())).(*types.Named)
	if !ok || isValue(named) {
		return nil, false
	}
	structure, ok := named.Underlying().(*types.Struct)
	return structure, ok
}

func relationTarget(field modelField) (*types.Named, bool) {
	if field.settings.has("SERIALIZER", "TYPE", "EMBEDDED") {
		return nil, false
	}
	typ := support.Deref(field.variable.Type())
	many := false
	if slice, ok := types.Unalias(typ).(*types.Slice); ok {
		typ, many = support.Deref(slice.Elem()), true
	}
	named, ok := types.Unalias(typ).(*types.Named)
	if !ok || isValue(named) {
		return nil, false
	}
	if _, isStruct := named.Underlying().(*types.Struct); !isStruct {
		return nil, false
	}
	return named, many
}

func isValue(named *types.Named) bool {
	if support.IsNamed(named, "time", "Time") {
		return true
	}
	methods := types.NewMethodSet(types.NewPointer(named))
	for index := range methods.Len() {
		if name := methods.At(index).Obj().Name(); name == "Scan" || name == "Value" {
			return true
		}
	}
	return false
}

func (field modelField) primary() bool {
	return field.settings.truthy("PRIMARYKEY") || field.settings.truthy("PRIMARY_KEY")
}

func (field modelField) column() string {
	if name := field.settings["COLUMN"]; name != "" {
		return name
	}
	return snake(field.variable.Name())
}

func snake(name string) string {
	runes := []rune(name)
	var out strings.Builder
	for index, each := range runes {
		if index > 0 && unicode.IsUpper(each) {
			previous := runes[index-1]
			nextLower := index+1 < len(runes) && unicode.IsLower(runes[index+1])
			if unicode.IsLower(previous) || unicode.IsDigit(previous) || unicode.IsUpper(previous) && nextLower {
				out.WriteByte('_')
			}
		}
		out.WriteRune(unicode.ToLower(each))
	}
	return out.String()
}

func covered(model *types.Named, key modelField) bool {
	fields := modelFields(model)
	if key.settings.truthy("UNIQUE") || leadingPrimary(fields, key) {
		return true
	}
	for _, parts := range indexes(model.Obj().Name(), fields) {
		lead := slices.MinFunc(parts, func(left, right indexPart) int {
			return cmp.Or(cmp.Compare(left.priority, right.priority), cmp.Compare(left.field.order, right.field.order))
		})
		partial := slices.ContainsFunc(parts, func(part indexPart) bool { return part.partial })
		if lead.field.variable == key.variable && !partial {
			return true
		}
	}
	return false
}

func leadingPrimary(fields []modelField, key modelField) bool {
	for _, field := range fields {
		if field.primary() {
			return field.variable == key.variable
		}
	}
	return false
}

func indexes(model string, fields []modelField) map[string][]indexPart {
	groups := map[string][]indexPart{}
	for _, field := range fields {
		for _, part := range strings.Split(field.raw, ";") {
			key, value, _ := strings.Cut(part, ":")
			key = strings.ToUpper(strings.TrimSpace(key))
			if key != "INDEX" && key != "UNIQUEINDEX" {
				continue
			}
			name, options, _ := strings.Cut(value, ",")
			parsed := parseOptions(options)
			if name == "" {
				name = model + "." + cmp.Or(parsed["COMPOSITE"], field.variable.Name())
			}
			priority, err := strconv.Atoi(parsed["PRIORITY"])
			if err != nil {
				priority = 10
			}
			partial := parsed["WHERE"] != "" || parsed["EXPRESSION"] != ""
			groups[name] = append(groups[name], indexPart{field: field, priority: priority, partial: partial})
		}
	}
	return groups
}

func parseOptions(options string) settings {
	parsed := settings{}
	for _, option := range strings.Split(options, ",") {
		key, value, _ := strings.Cut(option, ":")
		parsed[strings.ToUpper(strings.TrimSpace(key))] = value
	}
	return parsed
}
