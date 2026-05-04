import os
import re

_DEFAULT_DB = "hospital-management"
_DEFAULT_JOB_TMP_DIR = "/tmp/jobs"


def _bool_env(value: str | None) -> bool:
    return str(value or "").strip().lower() == "true"


class Config:
    """Loads and validates env vars at startup.

    Cloudinary and DigitalOcean Spaces are both optional — but at least
    one provider must be fully configured, otherwise the sidecar can't
    fetch source PDFs.
    """

    INTERNAL_API_SECRET: str
    CLOUDINARY_CLOUD_NAME: str | None
    CLOUDINARY_API_KEY: str | None
    CLOUDINARY_API_SECRET: str | None
    DO_SPACES_ENDPOINT: str | None
    DO_SPACES_ACCESS_KEY_ID: str | None
    DO_SPACES_SECRET_ACCESS_KEY: str | None
    DO_SPACES_BUCKET: str | None
    DO_SPACES_REGION: str | None
    USE_DIGITALOCEAN_AS_PRIMARY: bool
    MONGO_URI: str
    JOB_TMP_DIR: str

    def __init__(self) -> None:
        required = [
            "INTERNAL_API_SECRET",
            "MONGO_URI",
        ]
        optional_cloudinary = [
            "CLOUDINARY_CLOUD_NAME",
            "CLOUDINARY_API_KEY",
            "CLOUDINARY_API_SECRET",
        ]
        optional_do = [
            "DO_SPACES_ENDPOINT",
            "DO_SPACES_ACCESS_KEY_ID",
            "DO_SPACES_SECRET_ACCESS_KEY",
            "DO_SPACES_BUCKET",
            "DO_SPACES_REGION",
        ]

        missing = [k for k in required if not os.environ.get(k)]
        if missing:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing)}"
            )

        for k in required + optional_cloudinary + optional_do:
            setattr(self, k, os.environ.get(k))

        self.USE_DIGITALOCEAN_AS_PRIMARY = _bool_env(os.environ.get("USE_DIGITALOCEAN_AS_PRIMARY"))

        cloudinary_configured = all(
            os.environ.get(k) for k in optional_cloudinary
        )
        do_configured = all(
            os.environ.get(k) for k in [
                "DO_SPACES_ENDPOINT",
                "DO_SPACES_ACCESS_KEY_ID",
                "DO_SPACES_SECRET_ACCESS_KEY",
                "DO_SPACES_BUCKET",
            ]
        )
        if not (cloudinary_configured or do_configured):
            raise RuntimeError(
                "No storage provider configured: set CLOUDINARY_* or DO_SPACES_*"
            )

        self.MONGO_URI = self._ensure_db_name(self.MONGO_URI)
        self.JOB_TMP_DIR = os.environ.get("JOB_TMP_DIR", _DEFAULT_JOB_TMP_DIR)

    @staticmethod
    def _ensure_db_name(uri: str) -> str:
        """Append default DB name if URI path is empty (e.g. ends with '/' or has no path)."""
        match = re.search(r"mongodb(?:\+srv)?://[^/]+/([^?]*)", uri)
        if match and match.group(1).strip():
            return uri
        if "?" in uri:
            base, query = uri.split("?", 1)
            return f"{base.rstrip('/')}/{_DEFAULT_DB}?{query}"
        return f"{uri.rstrip('/')}/{_DEFAULT_DB}"

    def masked_uri(self) -> str:
        """URI with password masked — safe for logs."""
        return re.sub(r":([^@]+)@", ":****@", self.MONGO_URI)


config = Config()
