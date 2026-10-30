#!/bin/bash
# Own reviewed CI image only; no real data, credentials or public Bitcoin requests.
set -euo pipefail
lab_image="$1"
lab_static_manifest="$(node --input-type=module -e '
import {readFileSync, readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
const root = process.argv[1];
const manifest = {};
function walk(dir, prefix = "") {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
    else manifest[relative] = createHash("sha256").update(readFileSync(path.join(dir, entry.name))).digest("hex");
  }
}
walk(root);
if (!manifest["index.html"] || Object.keys(manifest).length < 2) throw new Error("independent built static closure missing");
process.stdout.write(JSON.stringify(manifest));
' "${2:-web/dist}")"
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
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
const expectedManifest = JSON.parse(process.argv[1]);
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
function files(dir, prefix = "") {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? files(path.join(dir, entry.name), relative) : [relative];
  });
}
const assets = files("/static");
if (JSON.stringify(assets.sort()) !== JSON.stringify(Object.keys(expectedManifest).sort())) throw new Error("image static closure differs from independent build");
for (const asset of assets) {
  const url = "http://127.0.0.1:8080/" + asset.split(path.sep).map(encodeURIComponent).join("/");
  const response = await fetch(url);
  const expected = readFileSync(path.join("/static", asset));
  const actual = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !actual.equals(expected) || createHash("sha256").update(actual).digest("hex") !== expectedManifest[asset]) throw new Error("static asset differs: " + asset);
}
console.log("checked exact image: health and " + assets.length + " complete static assets");
' "$lab_static_manifest"
LAUF_ENDE=1
