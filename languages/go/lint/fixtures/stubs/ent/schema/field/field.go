// Package field stands in for entgo.io/ent/schema/field in the fixtures.
package field

type Builder struct{}

func Int(string) *Builder {
	return &Builder{}
}

func String(string) *Builder {
	return &Builder{}
}

func (*Builder) Descriptor() {}

func (b *Builder) Unique() *Builder {
	return b
}

func (b *Builder) Optional() *Builder {
	return b
}

type Annotation struct{ Fields []string }

func (Annotation) Name() string {
	return "Fields"
}

func ID(first, second string, fields ...string) *Annotation {
	return &Annotation{Fields: append([]string{first, second}, fields...)}
}
