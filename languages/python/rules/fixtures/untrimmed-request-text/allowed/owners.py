from fastapi import FastAPI

app = FastAPI()


@app.get("/owners")
def find(last_name: str | None = None):
    last_name = (last_name or "").strip()
    return db.query(Owner).filter(Owner.last_name.ilike(f"{last_name}%")).all()
