.DEFAULT_GOAL := help

# ─── Dependencies ─────────────────────────────────────────────────────────────

.PHONY: install
install: install-npm hooks-install ## Install all dependencies and git hooks

.PHONY: install-npm
install-npm: ## Install npm dependencies only
	npm install

.PHONY: hooks-install
hooks-install: ## Install pre-commit and pre-push git hooks via pre-commit
	pre-commit install
	pre-commit install --hook-type pre-push

# ─── Development ──────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start the Electron app in development mode (hot reload)
	POLYPHON_TEST_USER_DATA=$(CURDIR)/.dev-data npm start

.PHONY: run
run: dev ## Alias for dev

# ─── Build ────────────────────────────────────────────────────────────────────

.PHONY: build
build: build-app ## Build the Electron app

.PHONY: build-app
build-app: ## Package the Electron app with Electron Forge
	npm run package

.PHONY: dist
dist: ## Create distributable installers for the current platform
	npm run make

# ─── Test ─────────────────────────────────────────────────────────────────────

.PHONY: test
test: test-unit test-integration test-e2e ## Run all non-live tests (unit + integration + e2e)

.PHONY: test-unit
test-unit: ## Run unit tests (TypeScript)
	npm run test:unit

.PHONY: test-integration
test-integration: ## Run integration tests (TypeScript)
	npm run test:integration

.PHONY: test-e2e
test-e2e: ## Run e2e tests with mocked agents
	npm run test:e2e

.PHONY: test-e2e-live
test-e2e-live: ## Run all live e2e tests — opt-in, never CI
	npm run build:e2e && npx playwright test --config=playwright.config.e2e-live.ts

.PHONY: test-openai-compatible
test-openai-compatible: ## Run live e2e tests against Ollama in Docker — requires Docker
	npm run build:e2e && npx playwright test --config=playwright.config.openai-compatible.ts

.PHONY: test-watch
test-watch: ## Run Vitest in watch mode (unit tests)
	npm run test:watch

# ─── Docker (CI mirror) ───────────────────────────────────────────────────────

.PHONY: test-docker
test-docker: ## Run lint + unit + integration in Docker (mirrors CI "test" job)
	docker compose -f docker/compose.yml run --rm ci

.PHONY: test-docker-unit
test-docker-unit: ## Run unit tests in Docker
	docker compose -f docker/compose.yml run --rm unit

.PHONY: test-docker-integration
test-docker-integration: ## Run integration tests in Docker
	docker compose -f docker/compose.yml run --rm integration

.PHONY: test-docker-e2e
test-docker-e2e: ## Run e2e tests in Docker (Playwright + Electron + Xvfb)
	docker compose -f docker/compose.yml run --rm e2e

# ─── Lint & Type-check ────────────────────────────────────────────────────────

.PHONY: lint
lint: lint-ts ## Run all linters

.PHONY: lint-ts
lint-ts: ## TypeScript type-check (no emit)
	npm run lint

# ─── Icons ───────────────────────────────────────────────────────────────────

.PHONY: icon-rasterize
icon-rasterize: ## Convert icon SVGs to 1024x1024 PNGs (requires rsvg-convert)
	rsvg-convert -w 1024 -h 1024 assets/icon-dark.svg -o assets/icon-dark-1024.png
	rsvg-convert -w 1024 -h 1024 assets/icon-light.svg -o assets/icon-light-1024.png

.PHONY: icon-generate
icon-generate: icon-rasterize ## Generate all platform icon formats from SVGs (requires electron-icon-maker)
	npx electron-icon-maker --input=assets/icon-dark-1024.png --output=assets/icons/dark
	npx electron-icon-maker --input=assets/icon-light-1024.png --output=assets/icons/light

# ─── Icons ────────────────────────────────────────────────────────────────────

.PHONY: icon-rasterize
icon-rasterize: ## Convert icon-dark.svg to a 1024x1024 PNG for icon generation (requires rsvg-convert)
	rsvg-convert -w 1024 -h 1024 assets/icon-dark.svg -o assets/icon-1024.png

.PHONY: icon-generate
icon-generate: icon-rasterize ## Generate all platform icon formats from icon-dark.svg (requires electron-icon-maker)
	npx electron-icon-maker --input=assets/icon-1024.png --output=assets/icons

.PHONY: icon-light-rasterize
icon-light-rasterize: ## Convert icon-light.svg to a 1024x1024 PNG for icon generation (requires rsvg-convert)
	rsvg-convert -w 1024 -h 1024 assets/icon-light.svg -o assets/icon-light-1024.png

.PHONY: icon-light-generate
icon-light-generate: icon-light-rasterize ## Generate all platform icon formats from icon-light.svg (requires electron-icon-maker)
	npx electron-icon-maker --input=assets/icon-light-1024.png --output=assets/icons-light

.PHONY: icons
icons: icon-generate icon-light-generate ## Generate all platform icons for both dark and light variants

# ─── Site ─────────────────────────────────────────────────────────────────────
# Run `cd site && npm install` once before using site-search.

.PHONY: screenshots
screenshots: ## Capture site screenshots and replace screenshot placeholders
	npx tsx scripts/take-screenshots.ts

.PHONY: videos
videos: ## Capture site videos, generate narration scripts, replace video placeholders
	npx tsx scripts/take-videos.ts

.PHONY: videos-docs
videos-docs: ## Capture only the three documentation video clips
	npx tsx scripts/take-videos.ts --docs-only

.PHONY: videos-walkthrough
videos-walkthrough: ## Capture only the full-product walkthrough video (starts/stops Ollama automatically)
	@OLLAMA_STARTED=0; \
	OLLAMA_PID=0; \
	if ! curl -sf http://localhost:11434/api/tags --max-time 2 > /dev/null 2>&1; then \
		echo "Starting Ollama..."; \
		ollama serve > /dev/null 2>&1 & \
		OLLAMA_PID=$$!; \
		OLLAMA_STARTED=1; \
		sleep 4; \
	fi; \
	npx tsx scripts/take-videos.ts --walkthrough-only; \
	EXIT_CODE=$$?; \
	if [ $$OLLAMA_STARTED -eq 1 ]; then \
		echo "Stopping Ollama (pid $$OLLAMA_PID)..."; \
		kill $$OLLAMA_PID 2>/dev/null || true; \
	fi; \
	exit $$EXIT_CODE

.PHONY: videos-custom-providers
videos-custom-providers: ## Capture only the custom providers (Ollama) video clip (starts/stops Ollama automatically)
	@OLLAMA_STARTED=0; \
	OLLAMA_PID=0; \
	if ! curl -sf http://localhost:11434/api/tags --max-time 2 > /dev/null 2>&1; then \
		echo "Starting Ollama..."; \
		ollama serve > /dev/null 2>&1 & \
		OLLAMA_PID=$$!; \
		OLLAMA_STARTED=1; \
		sleep 4; \
	fi; \
	npx tsx scripts/take-videos.ts --custom-providers-only; \
	EXIT_CODE=$$?; \
	if [ $$OLLAMA_STARTED -eq 1 ]; then \
		echo "Stopping Ollama (pid $$OLLAMA_PID)..."; \
		kill $$OLLAMA_PID 2>/dev/null || true; \
	fi; \
	exit $$EXIT_CODE

.PHONY: narration
narration: ## Generate WebVTT narration for all captured videos (requires ANTHROPIC_API_KEY)
	npx tsx scripts/generate-narration.ts

.PHONY: narration-walkthrough
narration-walkthrough: ## Generate WebVTT narration for the walkthrough video only
	npx tsx scripts/generate-narration.ts site/static/videos/home/full-walkthrough-cues.json

.PHONY: narration-docs
narration-docs: ## Generate WebVTT narration for the three docs video clips
	npx tsx scripts/generate-narration.ts \
		site/static/videos/docs/compositions-type-toggle-cues.json \
		site/static/videos/docs/sessions-streaming-cues.json \
		site/static/videos/docs/sessions-at-mention-cues.json

.PHONY: site-build
site-build: ## Build the Hugo marketing site
	hugo --minify -s site

.PHONY: site-search
site-search: site-build ## Build Hugo site + generate Pagefind search index
	cd site && npm run pagefind

.PHONY: site-dev
site-dev: ## Serve the Hugo site locally (run site-search first to enable /search/)
	hugo server -s site

# ─── Clean ────────────────────────────────────────────────────────────────────

.PHONY: clean
clean: clean-app clean-dev-data ## Remove all build artifacts and dev data

.PHONY: clean-app
clean-app: ## Remove Electron Forge / Vite build output
	rm -rf out .vite

.PHONY: clean-dev-data
clean-dev-data: ## Remove local development database
	rm -rf .dev-data

.PHONY: reset-app-data
reset-app-data: ## Delete packaged app user data (DB + localStorage) for a clean first-run test — macOS only
	rm -rf "$(HOME)/Library/Application Support/Polyphon"

# ─── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} \
	  /^[a-zA-Z0-9_\/-]+:.*##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
