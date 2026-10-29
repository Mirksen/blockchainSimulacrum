"""Synthetic release declarations, without network, credentials or a Docker daemon."""

import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "release", Path(__file__).parents[1] / "make-release.py"
)
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
                release.declaration(
                    {**self.app, **change}, self.tunnel, self.revision, 123
                )

    def test_unpushed_or_wrong_tunnel_cannot_be_published(self):
        app = copy.deepcopy(self.app)
        app["RepoDigests"] = ["other/synthetic@sha256:" + "f" * 64]
        with self.assertRaises(ValueError):
            release.declaration(app, self.tunnel, self.revision, 123)
        with self.assertRaises(ValueError):
            release.declaration(
                self.app, {**self.tunnel, "RepoDigests": []}, self.revision, 123
            )


if __name__ == "__main__":
    unittest.main()
