module fixtures

go 1.26

require (
	github.com/jackc/pgx/v5 v5.0.0
	github.com/rs/zerolog v0.0.0
	go.uber.org/zap v0.0.0
	golang.org/x/sync v0.0.0
)

replace (
	github.com/jackc/pgx/v5 => ./stubs/pgx
	github.com/rs/zerolog => ./stubs/zerolog
	go.uber.org/zap => ./stubs/zap
	golang.org/x/sync => ./stubs/errgroup
)
