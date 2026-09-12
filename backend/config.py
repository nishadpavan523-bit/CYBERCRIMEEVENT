import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Example: mysql+pymysql://user:password@localhost:3306/cybertrace
    # For local dev without MySQL installed you can use: sqlite:///./cybertrace.db
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:password@localhost:3306/cybertrace",
    )

    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-this-secret-key-in-env")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))  # 12h

    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "change-this-admin-password")

    CLIENT_ORIGIN: str = os.getenv("CLIENT_ORIGIN", "*")  # tighten in production


settings = Settings()
