import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Example: mysql+pymysql://user:password@localhost:3306/cybertrace
    # For local dev without MySQL installed you can use: sqlite:///./cybertrace.db
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:Pavan%408853@localhost:3306/cybertrace",
    )

    SECRET_KEY: str = os.getenv("SECRET_KEY", "9c15f64dbbb378798bdaa2302b103c71f1c1f2c83614fa422416606a8fa118c3")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))  # 12h

    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "Pavan@8853")

    CLIENT_ORIGIN: str = os.getenv("CLIENT_ORIGIN", "*")  # tighten in production


settings = Settings()
