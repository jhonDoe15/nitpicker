package graph

import (
	"context"
	"fmt"
	"sync"
)

func (r *viewResolver) Owner(ctx context.Context, obj *View) (*User, error) {
	user := &User{}
	row := r.DB.QueryRowContext(ctx, ownerQuery, obj.OwnerID) // want query-per-parent-resolver
	if err := row.Scan(&user.Name); err != nil {
		return nil, fmt.Errorf("owner of view %d: %w", obj.ID, err)
	}
	return user, nil
}

func (r *viewResolver) Summary(ctx context.Context, obj *View) (string, error) {
	id := obj.ID
	var title string
	row := r.DB.QueryRowContext(ctx, "SELECT title FROM views WHERE id = $1", id) // want query-per-parent-resolver
	err := row.Scan(&title)
	return title, err
}

func (r *viewResolver) Loaded(ctx context.Context, obj *View) (*User, error) {
	return r.Loaders.Load(ctx, obj.OwnerID)
}

func (*viewResolver) Heading(_ context.Context, obj *View) (string, error) {
	return obj.Title, nil
}

func (r *viewResolver) Total(ctx context.Context, _ *View) (int, error) {
	var total int
	err := r.DB.QueryRowContext(ctx, "SELECT count(*) FROM views").Scan(&total)
	return total, err
}

func (r *settingsResolver) Theme(ctx context.Context, obj *Settings) (string, error) {
	var theme string
	err := r.DB.QueryRowContext(ctx, "SELECT theme FROM settings WHERE id = $1", obj.ID).Scan(&theme)
	return theme, err
}

func (r *userResolver) Views(ctx context.Context, obj *User) (int, error) {
	var count int
	err := r.DB.QueryRowContext(ctx, "SELECT count(*) FROM views WHERE owner_id = $1", obj.ID).Scan(&count)
	return count, err
}

func (r *viewResolver) Author(_ context.Context, obj *View) (*User, error) {
	user := &User{}
	err := r.GDB.Where("id = ?", obj.OwnerID).Find(user).Error // want query-per-parent-resolver
	return user, err
}

type key struct{}

func (r *viewResolver) Related(ctx context.Context, obj *View) (int, error) {
	ctx = context.WithValue(ctx, key{}, obj.ID)
	var total int
	err := r.DB.QueryRowContext(ctx, "SELECT count(*) FROM views").Scan(&total)
	return total, err
}

var cache sync.Map

func (r *viewResolver) Cached(ctx context.Context, obj *View) (string, error) {
	if value, ok := cache.Load(obj.ID); ok {
		return fmt.Sprint(value), nil
	}
	var title string
	row := r.DB.QueryRowContext(ctx, "SELECT title FROM views WHERE id = $1", obj.ID) // want query-per-parent-resolver
	err := row.Scan(&title)
	return title, err
}
