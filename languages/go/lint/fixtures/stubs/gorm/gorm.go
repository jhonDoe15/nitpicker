// Package gorm stands in for gorm.io/gorm in the fixtures.
package gorm

import "time"

type DeletedAt struct {
	Time  time.Time
	Valid bool
}

func (*DeletedAt) Scan(any) error {
	return nil
}

type Model struct {
	ID        uint `gorm:"primarykey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt DeletedAt `gorm:"index"`
}

type DB struct {
	Error error
}

func (*DB) AutoMigrate(...any) error {
	return nil
}

func (*DB) Create(any) *DB {
	return nil
}

func (*DB) Save(any) *DB {
	return nil
}

func (*DB) Delete(any, ...any) *DB {
	return nil
}

func (*DB) Updates(any) *DB {
	return nil
}

func (*DB) Exec(string, ...any) *DB {
	return nil
}

func (*DB) Model(any) *DB {
	return nil
}

func (*DB) Table(string) *DB {
	return nil
}

func (*DB) Where(any, ...any) *DB {
	return nil
}

func (*DB) Find(any, ...any) *DB {
	return nil
}

func (*DB) Transaction(func(*DB) error) error {
	return nil
}

func (*DB) Begin() *DB {
	return nil
}
