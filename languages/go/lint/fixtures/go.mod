module fixtures

go 1.26

require (
	entgo.io/ent v0.0.0
	gorm.io/gorm v0.0.0
	github.com/jackc/pgx/v5 v5.0.0
	github.com/rs/zerolog v0.0.0
	github.com/jmoiron/sqlx v0.0.0
	go.uber.org/zap v0.0.0
	golang.org/x/sync v0.0.0
	github.com/robfig/cron/v3 v3.0.0
	github.com/go-co-op/gocron/v2 v2.0.0
	github.com/hibiken/asynq v0.0.0
	github.com/99designs/gqlgen v0.17.0
	github.com/RichardKnop/machinery/v2 v2.0.0
)

replace (
	entgo.io/ent => ./stubs/ent
	gorm.io/gorm => ./stubs/gorm
	github.com/jackc/pgx/v5 => ./stubs/pgx
	github.com/rs/zerolog => ./stubs/zerolog
	github.com/jmoiron/sqlx => ./stubs/sqlx
	go.uber.org/zap => ./stubs/zap
	golang.org/x/sync => ./stubs/errgroup
	github.com/robfig/cron/v3 => ./stubs/cron
	github.com/go-co-op/gocron/v2 => ./stubs/gocron
	github.com/hibiken/asynq => ./stubs/asynq
	github.com/99designs/gqlgen => ./stubs/gqlgen
	github.com/RichardKnop/machinery/v2 => ./stubs/machinery
)
