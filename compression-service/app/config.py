import os
import re

_DEFAULT_DB = "hospital-management"


class Config:
    """Loads and validates all required environment variables at startup."""

    INTERNAL_API_SECRET: str
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str
    MONGO_URI: str

    def __init__(self) -> None:
        required = [
            "INTERNAL_API_SECRET",
            "CLOUDINARY_CLOUD_NAME",
            "CLOUDINARY_API_KEY",
            "CLOUDINARY_API_SECRET",
            "MONGO_URI",
        ]
        missing = [k for k in required if not os.environ.get(k)]
        if missing:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing)}"
            )
        for k in required:
            setattr(self, k, os.environ[k])

        # Ensure URI always has a DB name — same behavior as Mongoose in the Node backend
        self.MONGO_URI = self._ensure_db_name(self.MONGO_URI)

    @staticmethod
    def _ensure_db_name(uri: str) -> str:
        """Append default DB name if URI path is empty (e.g. ends with '/' or has no path)."""
        match = re.search(r"mongodb(?:\+srv)?://[^/]+/([^?]*)", uri)
        if match and match.group(1).strip():
            return uri  # DB name already present
        # Insert DB name before query string
        if "?" in uri:
            base, query = uri.split("?", 1)
            return f"{base.rstrip('/')}/{_DEFAULT_DB}?{query}"
        return f"{uri.rstrip('/')}/{_DEFAULT_DB}"

    def masked_uri(self) -> str:
        """URI with password masked — safe for logs."""
        return re.sub(r":([^@]+)@", ":****@", self.MONGO_URI)


config = Config()
