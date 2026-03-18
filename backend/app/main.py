from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, items, lists, members

app = FastAPI(title="CarroQueSí API")

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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
