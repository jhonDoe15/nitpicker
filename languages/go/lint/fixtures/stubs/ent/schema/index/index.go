// Package index stands in for entgo.io/ent/schema/index in the fixtures.
package index

import "entgo.io/ent/schema"

type Builder struct{}

func Fields(...string) *Builder {
	return &Builder{}
}

func Edges(...string) *Builder {
	return &Builder{}
}

func (*Builder) Descriptor() {}

func (b *Builder) Fields(...string) *Builder {
	return b
}

func (b *Builder) Edges(...string) *Builder {
	return b
}

func (b *Builder) Unique() *Builder {
	return b
}

func (b *Builder) Annotations(...schema.Annotation) *Builder {
	return b
}
