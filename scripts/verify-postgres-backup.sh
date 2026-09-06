#!/usr/bin/env bash
set -Eeuo pipefail

log() {
	printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

if [[ "${ALLOW_RESTORE_CHECK:-}" != '1' ]]; then
	log 'restore_check_refused set_ALLOW_RESTORE_CHECK=1_for_a_disposable_database'
	exit 1
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
	log 'missing_required_variable name=RESTORE_DATABASE_URL'
	exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
	log 'missing_required_variable name=DATABASE_URL'
	exit 1
fi
if [[ "$RESTORE_DATABASE_URL" == "$DATABASE_URL" ]]; then
	log 'restore_check_refused source_and_target_are_identical'
	exit 1
fi

database_identity() {
	psql "$1" \
		--no-psqlrc \
		--tuples-only \
		--no-align \
		--set=ON_ERROR_STOP=1 \
		--command="SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port() || '/' || current_database();"
}

source_identity=$(database_identity "$DATABASE_URL")
target_identity=$(database_identity "$RESTORE_DATABASE_URL")
if [[ "$source_identity" == "$target_identity" ]]; then
	log 'restore_check_refused source_and_target_resolve_to_same_database'
	exit 1
fi

temp_dir=$(mktemp -d)
cleanup() {
	rm -rf -- "$temp_dir"
}
trap cleanup EXIT

if [[ -n "${BACKUP_LOCAL_DIR:-}" ]]; then
	if [[ -n "${BACKUP_OBJECT_KEY:-}" ]]; then
		source_dump="${BACKUP_LOCAL_DIR}/${BACKUP_OBJECT_KEY##*/}"
	else
		source_dump=$(find "$BACKUP_LOCAL_DIR" -maxdepth 1 -type f -name 'nudget-*.dump' | sort | tail -n 1)
	fi
	if [[ -z "${source_dump:-}" || ! -f "$source_dump" ]]; then
		log 'restore_check_failed no_local_dump_found'
		exit 1
	fi
	cp -- "$source_dump" "$temp_dir/backup.dump"
	if [[ -f "${source_dump}.json" ]]; then
		cp -- "${source_dump}.json" "$temp_dir/backup.dump.json"
	fi
	backup_key=${source_dump##*/}
else
	for name in ENDPOINT BUCKET; do
		if [[ -z "${!name:-}" ]]; then
			log "missing_required_variable name=${name}"
			exit 1
		fi
	done
	export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-${ACCESS_KEY_ID:-}}
	export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-${SECRET_ACCESS_KEY:-}}
	export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-${REGION:-auto}}
	for name in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
		if [[ -z "${!name:-}" ]]; then
			log "missing_required_variable name=${name}"
			exit 1
		fi
	done
	BACKUP_PREFIX=${BACKUP_PREFIX:-nudget/postgres}

	backup_key=${BACKUP_OBJECT_KEY:-}
	if [[ -z "$backup_key" ]]; then
		backup_key=$(aws s3api list-objects-v2 \
			--bucket "$BUCKET" \
			--prefix "${BACKUP_PREFIX}/" \
			--endpoint-url "$ENDPOINT" \
			--query "reverse(sort_by(Contents[?ends_with(Key, '.dump')], &LastModified))[0].Key" \
			--output text)
	fi
	if [[ -z "$backup_key" || "$backup_key" == 'None' ]]; then
		log 'restore_check_failed no_remote_dump_found'
		exit 1
	fi
	aws s3 cp "s3://${BUCKET}/${backup_key}" "$temp_dir/backup.dump" --endpoint-url "$ENDPOINT" --only-show-errors
	aws s3 cp "s3://${BUCKET}/${backup_key}.json" "$temp_dir/backup.dump.json" --endpoint-url "$ENDPOINT" --only-show-errors
fi

pg_restore --list "$temp_dir/backup.dump" >/dev/null
if [[ -f "$temp_dir/backup.dump.json" ]]; then
	expected_sha256=$(jq -er '.sha256' "$temp_dir/backup.dump.json")
	actual_sha256=$(sha256sum "$temp_dir/backup.dump" | cut -d ' ' -f 1)
	if [[ "$expected_sha256" != "$actual_sha256" ]]; then
		log 'restore_check_failed checksum_mismatch'
		exit 1
	fi
fi

log "restore_started key=${backup_key}"
pg_restore \
	--exit-on-error \
	--clean \
	--if-exists \
	--no-owner \
	--no-acl \
	--dbname="$RESTORE_DATABASE_URL" \
	"$temp_dir/backup.dump"

missing_tables=$(psql "$RESTORE_DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 <<'SQL'
WITH required(name) AS (
  VALUES
    ('users'),
    ('categories'),
    ('transactions'),
    ('monthly_plans'),
    ('bills'),
    ('bill_payments'),
    ('pending_slips'),
    ('reminder_deliveries'),
    ('processed_events')
)
SELECT COALESCE(string_agg(name, ',' ORDER BY name), '')
FROM required
WHERE to_regclass('public.' || name) IS NULL;
SQL
)
if [[ -n "$missing_tables" ]]; then
	log "restore_check_failed missing_tables=${missing_tables}"
	exit 1
fi

category_count=$(psql "$RESTORE_DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT count(*) FROM categories;')
if (( category_count < 1 )); then
	log 'restore_check_failed categories_are_empty'
	exit 1
fi

log "restore_check_completed key=${backup_key} categories=${category_count}"
