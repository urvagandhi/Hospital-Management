import os


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


config = Config()
