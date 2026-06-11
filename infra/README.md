# Local Infrastructure

Docker Compose stack for local World Cup Sim dependencies.

## Services

- Postgres: `localhost:5432`
- MinIO S3 API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- Default MinIO bucket: `worldcupsim-dev`

## Usage

```bash
docker compose --env-file infra/.env.example -f infra/docker-compose.yml up -d
```

To customize ports or credentials, copy `infra/.env.example` to `infra/.env`
and run:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

Stop the stack:

```bash
docker compose -f infra/docker-compose.yml down
```

Remove local volumes:

```bash
docker compose -f infra/docker-compose.yml down -v
```

## App Defaults

The default Postgres settings match `client/.env.example`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/worldcupsim"
```

MinIO uses S3-compatible local credentials:

```env
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
S3_BUCKET="worldcupsim-dev"
S3_FORCE_PATH_STYLE="true"
```
