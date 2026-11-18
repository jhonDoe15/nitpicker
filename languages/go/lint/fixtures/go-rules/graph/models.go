package graph

import (
	"context"
	"database/sql"

	"github.com/99designs/gqlgen/graphql"
	"gorm.io/gorm"
)

type View struct {
	ID      int
	OwnerID int `gorm:"index"`
	Title   string
	Owner   *User
}

func (View) MarshalGQL() {}

var _ graphql.Marshaler = View{}

type User struct {
	ID   int
	Name string
}

type Settings struct {
	ID int
}

type Resolver struct {
	DB      *sql.DB
	GDB     *gorm.DB
	Loaders *Loaders
}

type Loaders struct{}

func (*Loaders) Load(ctx context.Context, _ int) (*User, error) {
	return &User{}, ctx.Err()
}

const ownerQuery = "SELECT name FROM users WHERE id = $1"

type queryResolver struct{ *Resolver }

type viewResolver struct{ *Resolver }

type settingsResolver struct{ *Resolver }

type userResolver struct{ *Resolver }

func (*queryResolver) Views(ctx context.Context) ([]*View, error) {
	return nil, ctx.Err()
}

func (*queryResolver) Settings(ctx context.Context) (*Settings, error) {
	return &Settings{}, ctx.Err()
}

func (r *Resolver) Query() FieldResolver { return &queryResolver{r} }

func (r *Resolver) View() FieldResolver { return &viewResolver{r} }

func (r *Resolver) Settings() FieldResolver { return &settingsResolver{r} }

func (r *Resolver) User() FieldResolver { return &userResolver{r} }

type FieldResolver interface{ sealed() }

func (*queryResolver) sealed() {}

func (*viewResolver) sealed() {}

func (*settingsResolver) sealed() {}

func (*userResolver) sealed() {}
