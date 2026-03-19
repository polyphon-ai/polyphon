.DEFAULT_GOAL := help

##@ Setup

.PHONY: install
install: install-npm hooks-install ## Install all dependencies and git hooks

.PHONY: install-npm
install-npm: ## Install npm dependencies only
	npm install

.PHONY: hooks-install
hooks-install: ## Install pre-commit and pre-push git hooks via pre-commit
	pre-commit install
	pre-commit install --hook-type pre-push

##@ Development

.PHONY: run
run: ## Start the Electron app in development mode (hot reload)
	POLYPHON_TEST_USER_DATA=$(CURDIR)/.dev-data ELECTRON_DISABLE_SECURITY_WARNINGS=true npm start

##@ Build

.PHONY: build
build: ## Package the Electron app with Electron Forge (no installer)
	npm run package

.PHONY: dist
dist: ## Build macOS arm64 DMG; output to out/make/
	npm run make -- --arch arm64

##@ Test

.PHONY: test
test: lint test-unit test-integration test-e2e ## Run lint + unit + integration + e2e (non-live)

.PHONY: test-unit
test-unit: ## Run unit tests
	npm run test:unit

.PHONY: test-integration
test-integration: ## Run integration tests
	npm run test:integration

.PHONY: test-e2e
test-e2e: ## Run e2e tests with mocked voices
	npm run test:e2e

.PHONY: test-e2e-live
test-e2e-live: ## Run live e2e tests against real providers — opt-in, never CI
	npm run build:e2e && npx playwright test --config=playwright.config.e2e-live.ts

.PHONY: test-openai-compatible
test-openai-compatible: ## Run live e2e tests against Ollama in Docker — requires Docker
	npm run build:e2e && npx playwright test --config=playwright.config.openai-compatible.ts

.PHONY: test-watch
test-watch: ## Run Vitest in watch mode
	npm run test:watch

.PHONY: lint
lint: ## TypeScript type-check (no emit)
	npm run lint

##@ Icons

.PHONY: icons
icons: ## Generate macOS .icns from icon-dark.svg (requires rsvg-convert; uses built-in sips + iconutil)
	rsvg-convert -w 1024 -h 1024 assets/icon-dark.svg -o assets/icon-1024.png
	mkdir -p assets/icons/icon.iconset
	sips -z 16 16     assets/icon-1024.png --out assets/icons/icon.iconset/icon_16x16.png
	sips -z 32 32     assets/icon-1024.png --out assets/icons/icon.iconset/icon_16x16@2x.png
	sips -z 32 32     assets/icon-1024.png --out assets/icons/icon.iconset/icon_32x32.png
	sips -z 64 64     assets/icon-1024.png --out assets/icons/icon.iconset/icon_32x32@2x.png
	sips -z 128 128   assets/icon-1024.png --out assets/icons/icon.iconset/icon_128x128.png
	sips -z 256 256   assets/icon-1024.png --out assets/icons/icon.iconset/icon_128x128@2x.png
	sips -z 256 256   assets/icon-1024.png --out assets/icons/icon.iconset/icon_256x256.png
	sips -z 512 512   assets/icon-1024.png --out assets/icons/icon.iconset/icon_256x256@2x.png
	sips -z 512 512   assets/icon-1024.png --out assets/icons/icon.iconset/icon_512x512.png
	cp assets/icon-1024.png assets/icons/icon.iconset/icon_512x512@2x.png
	iconutil -c icns assets/icons/icon.iconset -o assets/icons/icon.icns
	rm -rf assets/icons/icon.iconset

##@ Site

.PHONY: site-dev
site-dev: ## Serve the Hugo site locally (run site-search first to enable /search/)
	hugo server -s site

.PHONY: site-build
site-build: ## Build the Hugo marketing site
	hugo --minify -s site

.PHONY: site-search
site-search: site-build ## Build Hugo site + generate Pagefind search index (run cd site && npm install first)
	cd site && npm run pagefind

.PHONY: screenshots
screenshots: ## Build a clean e2e bundle then capture site screenshots
	npm run build:e2e && npx tsx scripts/take-screenshots.ts

##@ Clean

.PHONY: clean
clean: clean-app clean-dev-data ## Remove all build artifacts and dev data

.PHONY: clean-app
clean-app: ## Remove Electron Forge / Vite build output
	rm -rf out .vite

.PHONY: clean-dev-data
clean-dev-data: ## Remove local development database
	rm -rf .dev-data

.PHONY: reset-app-data
reset-app-data: ## Delete packaged app user data for a clean first-run test — macOS only
	rm -rf "$(HOME)/Library/Application Support/Polyphon"

##@ Help

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
	  /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } \
	  /^[a-zA-Z0-9_\/-]+:.*##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' \
	  $(MAKEFILE_LIST)
