// Package mixin stands in for entgo.io/ent/schema/mixin in the fixtures.
package mixin

import "entgo.io/ent"

type Schema struct{}

func (Schema) Fields() []ent.Field {
	return nil
}

func (Schema) Edges() []ent.Edge {
	return nil
}

func (Schema) Indexes() []ent.Index {
	return nil
}

type Time struct{ Schema }
