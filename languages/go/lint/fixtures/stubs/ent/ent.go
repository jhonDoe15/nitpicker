// Package ent stands in for entgo.io/ent in the fixtures.
package ent

import "entgo.io/ent/schema"

type (
	Field interface{ Descriptor() }
	Edge  interface{ Descriptor() }
	Index interface{ Descriptor() }
	Mixin interface{ Fields() []Field }
)

type Interface interface{ Type() }

type Schema struct{ Interface }

func (Schema) Fields() []Field {
	return nil
}

func (Schema) Edges() []Edge {
	return nil
}

func (Schema) Indexes() []Index {
	return nil
}

func (Schema) Mixin() []Mixin {
	return nil
}

func (Schema) Annotations() []schema.Annotation {
	return nil
}
