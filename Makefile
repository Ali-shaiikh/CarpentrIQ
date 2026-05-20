.PHONY: dev frontend test seed migrate lint

dev:
	python3 -m uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	pytest tests/ -v --tb=short

seed:
	python scripts/seed_materials.py && python scripts/seed_catalogue.py

migrate:
	alembic upgrade head

lint:
	black app/ tests/ && ruff check app/ tests/
