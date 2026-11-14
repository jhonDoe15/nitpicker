// Package edge stands in for entgo.io/ent/schema/edge in the fixtures.
package edge

import "entgo.io/ent/schema"

type Builder struct{}

func To(string, any) *Builder {
	return &Builder{}
}

func From(string, any) *Builder {
	return &Builder{}
}

func (*Builder) Descriptor() {}

func (b *Builder) Ref(string) *Builder {
	return b
}

func (b *Builder) From(string) *Builder {
	return b
}

func (b *Builder) Unique() *Builder {
	return b
}

func (b *Builder) Required() *Builder {
	return b
}

func (b *Builder) Field(string) *Builder {
	return b
}

func (b *Builder) Through(string, any) *Builder {
	return b
}

func (b *Builder) Annotations(...schema.Annotation) *Builder {
	return b
}
