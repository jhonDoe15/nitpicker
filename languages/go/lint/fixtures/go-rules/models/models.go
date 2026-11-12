package models

import "gorm.io/gorm"

type User struct {
	gorm.Model
	Name      string
	Pets      []Pet
	Profile   Profile
	Company   Company
	CompanyID uint // want unindexed-foreign-key
}

type Pet struct {
	gorm.Model
	UserID uint // want unindexed-foreign-key
	Name   string
}

type Profile struct {
	gorm.Model
	UserID uint `gorm:"uniqueIndex"`
}

type Company struct {
	ID   uint `gorm:"primaryKey"`
	Name string
}

type Order struct {
	gorm.Model
	Buyer     User   `gorm:"foreignKey:BuyerRef"`
	BuyerRef  uint   `gorm:"index:idx_buyer_day,priority:2"` // want unindexed-foreign-key
	Day       string `gorm:"index:idx_buyer_day,priority:1"`
	Seller    User
	SellerID  uint   `gorm:"index:idx_seller_day"`
	SellerDay string `gorm:"index:idx_seller_day"`
	Courier   *User
	CourierID *uint  `gorm:"index:,where:courier_id IS NOT NULL"` // want unindexed-foreign-key
	Lines     []Line `gorm:"foreignKey:OrderRef"`
	Tags      []Tag  `gorm:"many2many:order_tags"`
}

type Line struct {
	OrderRef uint `gorm:"primaryKey"`
	Number   int  `gorm:"primaryKey"`
}

type Tag struct {
	gorm.Model
	Label string
}

type Category struct {
	gorm.Model
	ParentID *uint      `gorm:"index"`
	Children []Category `gorm:"foreignKey:ParentID"`
	OwnerID  uint       // want unindexed-foreign-key
	Owner    User       `gorm:"constraint:OnDelete:CASCADE"`
	Comments []Comment  `gorm:"polymorphic:Commentable"`
}

type Comment struct {
	gorm.Model
	CommentableID   uint
	CommentableType string
}

type Audit struct {
	gorm.Model
	ActorID uint
	Actor   User `gorm:"constraint:-"`
}

type Payload struct {
	Owner   User
	OwnerID uint
}

type Base struct {
	ID uint `gorm:"primaryKey"`
}

type Invoice struct {
	Base
	Customer   User
	CustomerID uint // want unindexed-foreign-key
}
