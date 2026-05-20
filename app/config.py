"""Application configuration — all secrets loaded from .env via Pydantic BaseSettings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/carpentriq"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # JWT
    jwt_secret_key: str = "changeme"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days

    # Razorpay
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_subscription_webhook_secret: str = ""  # separate secret for subscription webhooks
    # Razorpay plan IDs — create once in Razorpay dashboard, paste IDs here
    razorpay_plan_id_basic: str = ""    # ₹499/month — 20 images
    razorpay_plan_id_pro: str = ""      # ₹799/month — 40 images
    razorpay_plan_id_premium: str = ""  # ₹999/month — 60 images

    # Anthropic — haiku ONLY (see CLAUDE.md cost rules)
    anthropic_api_key: str = ""

    # Resend
    resend_api_key: str = ""
    resend_from_email: str = "noreply@carpentriq.in"

    # Supabase Storage
    storage_bucket: str = "carpentriq-uploads"
    supabase_url: str = ""
    supabase_service_key: str = ""

    # App
    app_env: str = "development"
    app_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"

    # OTP
    msg91_auth_key: str = ""
    msg91_template_id: str = ""

    # AI image generation — fal.ai (per-item furniture renders)
    fal_api_key: str = ""

    # OpenAI — DALL-E 3 for full room image generation
    openai_api_key: str = ""

    # Replicate — IP-Adapter for furniture-reference-conditioned generation
    replicate_api_token: str = ""

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
