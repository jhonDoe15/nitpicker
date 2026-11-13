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

type DB struct{}

func (*DB) AutoMigrate(...any) error {
	return nil
}
