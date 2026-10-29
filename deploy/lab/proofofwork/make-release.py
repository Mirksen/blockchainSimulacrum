#!/usr/bin/env python3
"""Declare the exact checked ARM64 image and data contract after a successful push."""

import argparse
import json
import re
import subprocess
from pathlib import Path

REPOSITORY = "Mirksen/blockchainSimulacrum"
IMAGE_REPOSITORY = "ghcr.io/mirksen/proofofwork-lab"
TUNNEL_IMAGE = "cloudflare/cloudflared@sha256:c6c7ae1d5dfdcb094ad344ed68ccffc26635c9c6be80965664c33baf064b0515"
MAX_IMAGE_BYTES = 384 * 1024**2


def declaration(app, tunnel, revision, run_id):
    if (
        not re.fullmatch(r"[0-9a-f]{40}", revision)
        or type(run_id) is not int
        or run_id < 1
    ):
        raise ValueError("exact source revision and run id required")
    if app["Architecture"] != "arm64" or app["Os"] != "linux":
        raise ValueError("ARM64 Linux runtime required")
    if tunnel["Architecture"] != "arm64" or tunnel["Os"] != "linux":
        raise ValueError("ARM64 Linux tunnel required")
    if app["Config"].get("Volumes") or tunnel["Config"].get("Volumes"):
        raise ValueError("implicit writable image volumes forbidden")
    if (
        app["Config"].get("Labels", {}).get("org.opencontainers.image.revision")
        != revision
    ):
        raise ValueError("image revision differs from checked source")
    digests = [
        r for r in app["RepoDigests"] if r.startswith(IMAGE_REPOSITORY + "@sha256:")
    ]
    if len(digests) != 1 or not re.fullmatch(
        re.escape(IMAGE_REPOSITORY) + r"@sha256:[0-9a-f]{64}", digests[0]
    ):
        raise ValueError("one pushed repository digest required")
    if TUNNEL_IMAGE not in tunnel["RepoDigests"]:
        raise ValueError("reviewed tunnel digest required")
    size = app["Size"] + tunnel["Size"]
    if not 0 < size <= MAX_IMAGE_BYTES:
        raise ValueError("runtime exceeds admitted unpacked size")
    image = digests[0]
    return {
        "project": "proofofwork",
        "revision": revision,
        "image": image,
        "image_bytes": size,
        "tunnel_image": TUNNEL_IMAGE,
        "data_version": 1,
        "ci": {
            "repository": REPOSITORY,
            "workflow": "server.yml",
            "run_id": run_id,
            "head_sha": revision,
            "image": image,
        },
    }


def inspect(image):
    return json.loads(
        subprocess.check_output(["docker", "image", "inspect", image], text=True)
    )[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--run-id", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    release = declaration(
        inspect(IMAGE_REPOSITORY + ":" + args.revision),
        inspect(TUNNEL_IMAGE),
        args.revision,
        args.run_id,
    )
    with args.output.open("x") as stream:
        json.dump(release, stream, sort_keys=True, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
