module fixtures

go 1.26

require (
	entgo.io/ent v0.0.0
	gorm.io/gorm v0.0.0
	github.com/jackc/pgx/v5 v5.0.0
	github.com/rs/zerolog v0.0.0
	go.uber.org/zap v0.0.0
	golang.org/x/sync v0.0.0
)

replace (
	entgo.io/ent => ./stubs/ent
	gorm.io/gorm => ./stubs/gorm
	github.com/jackc/pgx/v5 => ./stubs/pgx
	github.com/rs/zerolog => ./stubs/zerolog
	go.uber.org/zap => ./stubs/zap
	golang.org/x/sync => ./stubs/errgroup
)
