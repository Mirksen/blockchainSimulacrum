"""Read image allocation from Docker's local containerd store, including unpacked data."""

import http.client
import json
import socket
from urllib.parse import quote


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")


def inspect_image(reference):
    # Use the local daemon explicitly; never consume an inherited remote context.
    connection = DockerConnection("localhost", timeout=15)
    try:
        connection.request("GET", "/images/" + quote(reference, safe="") + "/json?manifests=true")
        response = connection.getresponse()
        raw = response.read(1024 * 1024 + 1)
        if response.status != 200 or len(raw) > 1024 * 1024:
            raise ValueError("bounded local image metadata unavailable")
        metadata = json.loads(raw)
        if not isinstance(metadata, dict):
            raise ValueError("invalid image metadata")
        return metadata
    finally:
        connection.close()


def storage_bytes(metadata):
    # Older Docker inspect Size can contain packed bytes only. Manifest summaries
    # retain both sizes, and also account for locally available attestations.
    manifests = metadata.get("Manifests")
    if not isinstance(manifests, list) or not manifests:
        raise ValueError("containerd manifest allocation metadata required")
    total = 0
    arm64 = False
    for manifest in manifests:
        if manifest.get("Available") is not True:
            continue
        size = manifest["Size"]
        content = size["Content"]
        unpacked = 0
        if manifest["Kind"] == "image":
            data = manifest["ImageData"]
            unpacked = data["Size"]["Unpacked"]
            platform = data["Platform"]
            arm64 |= platform["os"] == "linux" and platform["architecture"] == "arm64"
        elif manifest["Kind"] != "attestation":
            raise ValueError("unmeasured image manifest kind")
        if (
            any(type(value) is not int or value < 0 for value in (content, unpacked, size["Total"]))
            or content == 0
            or size["Total"] != content + unpacked
            or (manifest["Kind"] == "image" and unpacked == 0)
        ):
            raise ValueError("incomplete image allocation metadata")
        total += size["Total"]
    inspected = metadata["Size"]
    if not arm64 or type(inspected) is not int or inspected <= 0:
        raise ValueError("complete local ARM64 allocation required")
    return max(inspected, total)
