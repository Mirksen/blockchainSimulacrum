# Reviewed Lab releases

This repository supplies one complete runtime image for its own application.
The host operator owns isolation, budgets, secrets, data mounts and release admission.
Application repository files are never downloaded and executed as root on the host.

## Build and publication

`server.yml` checks the server, builds and checks the web bundle, and builds a native
Linux ARM64 image containing `server/src`, `server/data`, `server/package.json` and
`web/dist`. A credential-free container with no external network must serve both
`/api/health` and every built static asset, compared with independent SHA-256 values
from the checked web build. The checked image is saved with its
image ID and checksums. Publication loads that same archive; it never rebuilds it.

A successful push run on `master` publishes
`ghcr.io/mirksen/proofofwork-lab:<full revision>` and the immutable artifact
`lab-release-<run_id>-<run_attempt>/release.json`. The image has an OCI revision label;
the declaration binds its repository digest, full revision, complete retained app+tunnel allocation,
ARM64 platform, data version and exact successful workflow run. PRs only check and
produce the short-lived checked-image artifact; they do not publish a release.
The package is intended for public anonymous pulls, matching this public source
repository. Confirm package visibility and anonymous digest access before admission.

Local checks (Node 24):

```sh
npm --prefix server test
npm --prefix web ci
npm --prefix web run check
python3 -m unittest discover -s deploy/lab/proofofwork/test -p test_release.py -v
docker build --build-arg SOURCE_REVISION="$(git rev-parse HEAD)" -t proofofwork-lab:checked -f deploy/lab/proofofwork/Dockerfile .
bash deploy/lab/proofofwork/test/image-check.sh proofofwork-lab:checked
```

## Operator admission and updates

A merge produces a candidate artifact. The installed host operator independently
verifies the exact successful `server.yml` push run on `master`, its revision and
artifact bytes. An operator-protected receipt is required for admission or update.
Neither a mutable image tag nor a green unrelated workflow authorizes a release.
No GitHub job receives host SSH access, tunnel tokens or application secrets.

The host's `hausbot-lab` interface accepts a reviewed release ID and an environment
identity consisting of project, purpose and run. The operator generates container
configuration; this repository supplies no executable host deploy script or Compose
file. Each environment has its own network, bounded data filesystem, expiry and
root-protected `app.env`, plus a separate `tunnel.env` only when public ingress is
explicitly admitted. Example values are in `proofofwork/*.env.example`.

Stop the previous pull-deploy timer and let an already running deployment finish
before merging the removal of that legacy interface. The healthy old container may
remain available while the checked image is published. Cut over only after the
operator, verified artifact, capacity, consistent backup and recovery path are ready.
A repository merge is not proof of host admission or live installation.

For subsequent releases, pass the verified declaration to the operator and run its
controlled update. There is no application-owned root timer. The operator closes
public ingress before the candidate writes, checks health, and restores the prior
code/data pair if that candidate fails before ingress opens. After public writes,
a code rollback does not imply that older code understands newer data.

## Data version 1

State is SQLite at `/data/leaderboard.sqlite`, using WAL and a bounded filesystem.
The image contains name moderation lists in `/app/data`; it contains no database,
secrets, host paths or runtime environment files. `ALLOWED_ORIGINS` allows the
intended browser origins; outgoing HTTPS to `mempool.space` supplies public round
data. `CHALLENGE_SECRET` is no longer read.

The genesis proof server creates `proofs` and its index if absent. The previous
`shares` table is preserved but not read. Admission must preserve the original
SQLite files under a writer stop; an empty leaderboard is not a backup. A snapshot
captures the whole filesystem after every writer stops and the filesystem unmounts.
Transfer the immutable release, snapshot, data-version receipt and hashes. Restore
into a stopped bounded target, verify integrity and retained data, then move ingress.
A version number alone does not prove downgrade compatibility: restores require the
same immutable release; a future schema change needs a new reviewed data contract.

## Moderation

With an admitted environment, the operator may execute the image's admin command
inside that environment's app container (`node src/admin.js hide <name>`, `unhide`,
or `list-hidden`). This updates that environment's SQLite data, not another stack.
Do not edit the read-only image or restore an old database while public writers run.

### Image storage measurement

Release publication and admission require the local Docker containerd image store.
The declaration counts retained compressed content, unpacked ARM64 snapshots and
available attestation content. Older `docker image inspect` versions report only
packed bytes in `Size`; the bounded local Engine API query requests manifest
summaries explicitly and rejects missing or incomplete allocation metadata. The
existing 384 MiB combined app/tunnel ceiling remains unchanged. PR CI checks the
same measurement on the actual built image before publication can be reached.

The publisher upgrades only its fresh hosted Docker daemon when it is older than
28.2.2, using the runner’s existing Microsoft `moby-engine`/`moby-cli` packages
(`28.2.2-ubuntu24.04u1`). No Docker CE repository is added. Docker28.0.4
incorrectly tags every child manifest during a containerd
push (upstream [moby/moby#49949](https://github.com/moby/moby/pull/49949)), which
left the first release tag pointing at an attestation after a failed push. The
checked archive, image/index ID and attestations remain unchanged. A subsequent
anonymous registry pull must return that exact checked ID before a release
declaration can be published. This does not reconfigure any pool or application host.
