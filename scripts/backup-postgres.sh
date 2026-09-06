#!/usr/bin/env bash
set -Eeuo pipefail

log() {
	printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

temp_dir=''
on_exit() {
	local exit_code=$?
	if [[ -n "$temp_dir" ]]; then
		rm -rf -- "$temp_dir"
	fi
	if (( exit_code == 0 )); then
		return
	fi

	log "backup_failed exit_code=${exit_code}"
	if [[ -n "${LINE_CHANNEL_ACCESS_TOKEN:-}" && -n "${BACKUP_ALERT_LINE_USER_ID:-}" ]]; then
		local message
		message=$(jq -nc \
			--arg to "$BACKUP_ALERT_LINE_USER_ID" \
			--arg text "Nudget backup ล้มเหลวเวลา $(date -u +%Y-%m-%dT%H:%M:%SZ) กรุณาตรวจ Railway logs" \
			'{to: $to, messages: [{type: "text", text: $text}]}')
		curl --fail --silent --show-error \
			--request POST 'https://api.line.me/v2/bot/message/push' \
			--header "Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}" \
			--header 'Content-Type: application/json' \
			--data "$message" >/dev/null || log 'backup_alert_failed'
	fi
}
trap on_exit EXIT

require_value() {
	local name=$1
	if [[ -z "${!name:-}" ]]; then
		log "missing_required_variable name=${name}"
		return 1
	fi
}

require_value DATABASE_URL

BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
BACKUP_PREFIX=${BACKUP_PREFIX:-nudget/postgres}
if [[ ! "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( BACKUP_RETENTION_DAYS < 1 || BACKUP_RETENTION_DAYS > 365 )); then
	log 'invalid_backup_retention expected_integer_between_1_and_365'
	exit 1
fi

temp_dir=$(mktemp -d)

timestamp=$(date -u +%Y%m%dT%H%M%S%NZ)
filename="nudget-${timestamp}-${RANDOM}.dump"
dump_path="${temp_dir}/${filename}"
manifest_path="${dump_path}.json"

log "backup_started"
pg_dump \
	--dbname="$DATABASE_URL" \
	--format=custom \
	--compress=9 \
	--no-owner \
	--no-acl \
	--file="$dump_path"

pg_restore --list "$dump_path" >/dev/null
dump_bytes=$(stat -c '%s' "$dump_path")
dump_sha256=$(sha256sum "$dump_path" | cut -d ' ' -f 1)
jq -nc \
	--arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
	--arg filename "$filename" \
	--arg sha256 "$dump_sha256" \
	--argjson bytes "$dump_bytes" \
	'{version: 1, createdAt: $createdAt, filename: $filename, format: "pg_dump-custom", sha256: $sha256, bytes: $bytes}' \
	>"$manifest_path"

if [[ -n "${BACKUP_LOCAL_DIR:-}" ]]; then
	mkdir -p -- "$BACKUP_LOCAL_DIR"
	cp -- "$dump_path" "$manifest_path" "$BACKUP_LOCAL_DIR/"
	find "$BACKUP_LOCAL_DIR" -type f -name 'nudget-*.dump*' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
	log "backup_completed destination=local key=${filename} bytes=${dump_bytes} sha256=${dump_sha256}"
	exit 0
fi

require_value ENDPOINT
require_value BUCKET
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-${ACCESS_KEY_ID:-}}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-${SECRET_ACCESS_KEY:-}}
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-${REGION:-auto}}
require_value AWS_ACCESS_KEY_ID
require_value AWS_SECRET_ACCESS_KEY

object_key="${BACKUP_PREFIX}/${filename}"
aws s3 cp "$dump_path" "s3://${BUCKET}/${object_key}" --endpoint-url "$ENDPOINT" --only-show-errors
aws s3 cp "$manifest_path" "s3://${BUCKET}/${object_key}.json" --endpoint-url "$ENDPOINT" --only-show-errors

remote_bytes=$(aws s3api head-object \
	--bucket "$BUCKET" \
	--key "$object_key" \
	--endpoint-url "$ENDPOINT" \
	--query 'ContentLength' \
	--output text)
if [[ "$remote_bytes" != "$dump_bytes" ]]; then
	log "backup_verification_failed local_bytes=${dump_bytes} remote_bytes=${remote_bytes}"
	exit 1
fi

cutoff=$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)
expired_output=$(aws s3api list-objects-v2 \
	--bucket "$BUCKET" \
	--prefix "${BACKUP_PREFIX}/" \
	--endpoint-url "$ENDPOINT" \
	--query "Contents[?ends_with(Key, '.dump') && LastModified<=\`${cutoff}\`].Key" \
	--output text)
mapfile -t expired_keys < <(printf '%s\n' "$expired_output" | tr '\t' '\n')

expired_count=0
for expired_dump_key in "${expired_keys[@]:-}"; do
	if [[ -n "$expired_dump_key" && "$expired_dump_key" != 'None' ]]; then
		aws s3 rm "s3://${BUCKET}/${expired_dump_key}" --endpoint-url "$ENDPOINT" --only-show-errors
		aws s3 rm "s3://${BUCKET}/${expired_dump_key}.json" --endpoint-url "$ENDPOINT" --only-show-errors
		((expired_count += 1))
	fi
done

log "backup_completed destination=s3 key=${object_key} bytes=${dump_bytes} sha256=${dump_sha256} expired_backups_deleted=${expired_count}"
