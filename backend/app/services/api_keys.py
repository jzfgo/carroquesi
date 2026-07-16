import hashlib
import secrets

from cryptography.fernet import Fernet

from app.core.config import settings

KEY_PREFIX = "cqs_"


def generate_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


def encrypt_key(plaintext: str) -> str:
    fernet = Fernet(settings.api_key_encryption_secret.encode())
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    fernet = Fernet(settings.api_key_encryption_secret.encode())
    return fernet.decrypt(ciphertext.encode()).decode()
