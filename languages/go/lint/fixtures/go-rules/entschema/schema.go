package entschema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"entgo.io/ent/schema/mixin"
)

type User struct{ ent.Schema }

func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("pets", Pet.Type),
		edge.To("cars", Car.Type),
		edge.To("card", Card.Type).Unique(),
		edge.To("groups", Group.Type),
		edge.To("notes", Note.Type), // want unindexed-foreign-key
		edge.To("manager", User.Type).Unique(),
		edge.To("team", Team.Type).Unique(), // want unindexed-foreign-key
	}
}

type Pet struct{ ent.Schema }

func (Pet) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("owner", User.Type).Ref("pets").Unique(), // want unindexed-foreign-key
	}
}

type Car struct{ ent.Schema }

func (Car) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.Time{}}
}

func (Car) Fields() []ent.Field {
	return []ent.Field{field.Int("owner_id"), field.String("plate")}
}

func (Car) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("owner", User.Type).Ref("cars").Unique().Field("owner_id"),
	}
}

func (Car) Indexes() []ent.Index {
	return []ent.Index{index.Fields("owner_id", "plate")}
}

type Card struct{ ent.Schema }

func (Card) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("owner", User.Type).Ref("card").Unique(),
	}
}

type Group struct{ ent.Schema }

func (Group) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("users", User.Type).Ref("groups"),
	}
}

type Note struct{ ent.Schema }

type Team struct{ ent.Schema }

func (Team) Edges() []ent.Edge {
	return []ent.Edge{edge.From("members", User.Type).Ref("team")}
}

type Node struct{ ent.Schema }

func (Node) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("children", Node.Type).From("parent").Unique(),
		edge.To("links", Link.Type),
	}
}

func (Node) Indexes() []ent.Index {
	return []ent.Index{index.Edges("parent")}
}

type Link struct{ ent.Schema }

func (Link) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("node", Node.Type).Ref("links").Unique(), // want unindexed-foreign-key
		edge.To("target", Node.Type).Unique(),              // want unindexed-foreign-key
	}
}

func (Link) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("weight").Edges("node"),
		index.Edges("target").Annotations(entsql.IndexWhere("active")),
	}
}

type Membership struct{ ent.Schema }

func (Membership) Annotations() []schema.Annotation {
	return []schema.Annotation{field.ID("user_id", "group_id")}
}

func (Membership) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("user", User.Type).Unique().Field("user_id"),
		edge.To("group", Group.Type).Unique().Field("group_id"), // want unindexed-foreign-key
	}
}

type Legacy struct{ ent.Schema }

func (Legacy) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Skip: true}}
}

func (Legacy) Edges() []ent.Edge {
	return []ent.Edge{edge.To("owner", User.Type).Unique()}
}

type Tenant struct{ mixin.Schema }

func (Tenant) Indexes() []ent.Index {
	return []ent.Index{index.Edges("tenant")}
}

type Invoice struct{ ent.Schema }

func (Invoice) Mixin() []ent.Mixin {
	return []ent.Mixin{Tenant{}}
}

func (Invoice) Edges() []ent.Edge {
	return []ent.Edge{edge.To("tenant", Team.Type).Unique()}
}
