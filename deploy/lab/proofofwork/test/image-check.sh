#!/bin/bash
# Own reviewed CI image only; no real data, credentials or public Bitcoin requests.
set -euo pipefail
lab_image="$1"
lab_image_check="proofofwork-image-check-${GITHUB_RUN_ID:-local}-$$"
lab_container_id=
LAUF_ENDE=0
lab_cleanup() {
  local rc=$?
  trap - EXIT
  set +e
  if [ "$rc" -eq 0 ] && [ "$LAUF_ENDE" -ne 1 ]; then rc=1; fi
  if [ -n "$lab_container_id" ]; then
    if [ "$(docker inspect --format '{{index .Config.Labels "io.proofofwork.image-check"}}' "$lab_container_id")" != "$lab_image_check" ]; then
      rc=1
    else
      if ! docker rm -f "$lab_container_id" >/dev/null; then rc=1; fi
      if docker inspect "$lab_container_id" >/dev/null 2>&1; then rc=1; fi
    fi
  fi
  exit "$rc"
}
trap lab_cleanup EXIT
lab_container_id="$(docker run --detach --name "$lab_image_check" \
  --label "io.proofofwork.image-check=$lab_image_check" --network none \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 384m --cpus .5 --pids-limit 128 \
  --tmpfs /data:rw,noexec,nosuid,size=67108864,uid=1000,gid=1000 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16777216,uid=1000,gid=1000 "$lab_image")"
# Same bytes that are published: both Node's full runtime and built static closure.
docker exec "$lab_container_id" node --input-type=module -e '
import {readFileSync} from "node:fs";
let healthy = false;
for (let attempt=0; attempt<30; attempt++) {
  try { healthy = (await fetch("http://127.0.0.1:8080/api/health")).ok; } catch {}
  if (healthy) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
if (!healthy) throw new Error("runtime health failed");
const response = await fetch("http://127.0.0.1:8080/");
const actual = await response.text();
const expected = readFileSync("/static/index.html", "utf8");
if (!response.ok || actual !== expected) throw new Error("static closure differs");
console.log("checked exact image: health and built static index");
'
LAUF_ENDE=1
