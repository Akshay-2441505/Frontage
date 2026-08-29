"""Shared Razorpay client. Always test-mode keys — see .env.example.

Fails loudly if unconfigured, same principle as llm_client.py: a money-path
agent must never silently no-op.
"""
import razorpay

from app.config import settings


class RazorpayNotConfigured(RuntimeError):
    pass


def get_client() -> razorpay.Client:
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise RazorpayNotConfigured(
            "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. Copy .env.example to .env "
            "at the repo root and fill in real Razorpay TEST-MODE keys."
        )
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
