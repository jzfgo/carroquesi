from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.firebase import get_firebase_app
from app.routers import auth, barcode, invites, items, lists, members, share, suggestions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Firebase Admin SDK once at startup so any misconfiguration
    # (missing credentials file, invalid key) fails fast rather than on the
    # first authenticated request.
    get_firebase_app()
    yield


app = FastAPI(title="CarroQueSí API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(lists.router)
app.include_router(members.router)
app.include_router(items.router)
app.include_router(invites.router)
app.include_router(invites.list_invites_router)
app.include_router(suggestions.router)
app.include_router(barcode.router)
app.include_router(share.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
