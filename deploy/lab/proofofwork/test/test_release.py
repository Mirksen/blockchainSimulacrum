"""Synthetic release declarations, without network, credentials or a Docker daemon."""

import copy
import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

spec = importlib.util.spec_from_file_location(
    "release", Path(__file__).parents[1] / "make-release.py"
)
assert spec is not None and spec.loader is not None
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseContract(unittest.TestCase):
    def setUp(self):
        self.revision = "a" * 40
        self.image = release.IMAGE_REPOSITORY + "@sha256:" + "b" * 64
        self.app = {
            "Architecture": "arm64",
            "Os": "linux",
            "Size": 200000000,
            "Config": {"Labels": {"org.opencontainers.image.revision": self.revision}},
            "RepoDigests": ["unrelated/synthetic@sha256:" + "c" * 64, self.image],
        }
        self.tunnel = {
            "Architecture": "arm64",
            "Os": "linux",
            "Size": 100000000,
            "Config": {},
            "RepoDigests": [release.TUNNEL_IMAGE],
        }

        for metadata in (self.app, self.tunnel):
            metadata["Manifests"] = [
                {
                    "Available": True,
                    "Kind": "image",
                    "ImageData": {
                        "Platform": {"os": "linux", "architecture": "arm64"},
                        "Size": {"Unpacked": metadata["Size"] - 10000000},
                    },
                    "Size": {"Content": 10000000, "Total": metadata["Size"]},
                },
            ]

    def test_exact_contract_uses_matching_digest(self):
        result = release.declaration(self.app, self.tunnel, self.revision, 123)
        self.assertEqual(result["image"], self.image)
        self.assertEqual(result["ci"]["image"], self.image)
        self.assertEqual(result["image_bytes"], 300000000)
        self.assertEqual(result["data_version"], 1)

    def test_wrong_revision_architecture_volume_or_size_is_rejected(self):
        for change in (
            {"Architecture": "amd64"},
            {"Size": 500000000},
            {"Config": {"Volumes": {"/unbounded": {}}}},
            {"Config": {"Labels": {"org.opencontainers.image.revision": "d" * 40}}},
        ):
            with self.subTest(change=change), self.assertRaises(ValueError):
                release.declaration({**self.app, **change}, self.tunnel, self.revision, 123)

    def test_old_inspect_size_cannot_omit_unpacked_data(self):
        app = copy.deepcopy(self.app)
        # Synthetic response with the observed Docker29.1 accounting shape.
        app["Size"] = 58678578
        app["Manifests"] = [
            {
                "Available": True,
                "Kind": "image",
                "ImageData": {
                    "Platform": {"os": "linux", "architecture": "arm64"},
                    "Size": {"Unpacked": 171315200},
                },
                "Size": {"Content": 58674712, "Total": 229989912},
            },
            {
                "Available": True,
                "Kind": "attestation",
                "Size": {"Content": 323277, "Total": 323277},
            },
        ]
        result = release.declaration(app, self.tunnel, self.revision, 123)
        self.assertEqual(result["image_bytes"], 330313189)

    def test_unpushed_or_wrong_tunnel_cannot_be_published(self):
        app = copy.deepcopy(self.app)
        app["RepoDigests"] = ["other/synthetic@sha256:" + "f" * 64]
        with self.assertRaises(ValueError):
            release.declaration(app, self.tunnel, self.revision, 123)
        with self.assertRaises(ValueError):
            release.declaration(self.app, {**self.tunnel, "RepoDigests": []}, self.revision, 123)


if __name__ == "__main__":
    unittest.main()
