.DEFAULT_GOAL := help

##@ Setup

.PHONY: install
install: install-npm hooks-install ## Install all dependencies and git hooks

.PHONY: install-npm
install-npm: ## Install npm dependencies only
	npm install

.PHONY: hooks-install
hooks-install: ## Install git hooks (pre-commit via pre-commit; pre-push via scripts/pre-push-hook.sh)
	pre-commit install
	install -m 755 scripts/pre-push-hook.sh .git/hooks/pre-push

##@ Development

.PHONY: run
run: ## Start the Electron app in development mode (hot reload)
	POLYPHON_TEST_USER_DATA=$(CURDIR)/.dev-data ELECTRON_DISABLE_SECURITY_WARNINGS=true npm start

##@ Build

.PHONY: build
build: ## Package the Electron app with Electron Forge (no installer)
	npm run package

.PHONY: build-e2e
build-e2e: ## Build Vite bundles for e2e testing (no Forge packaging)
	npm run build:e2e

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
test-e2e: build-e2e ## Run e2e tests with mocked voices
	npx playwright test

.PHONY: test-e2e-live
test-e2e-live: build-e2e ## Run all live e2e tests (providers + search + encryption + openai-compat) — opt-in, never CI
	npx playwright test --config=playwright.config.e2e-live.ts && npx playwright test --config=playwright.config.openai-compatible.ts

.PHONY: test-e2e-providers-live
test-e2e-providers-live: build-e2e ## Run all live provider e2e tests (API + CLI + mixed)
	npx playwright test --config=playwright.config.e2e-live.ts e2e/providers-api.e2e-live.test.ts e2e/providers-cli.e2e-live.test.ts e2e/providers-mixed.e2e-live.test.ts

.PHONY: test-e2e-api-live
test-e2e-api-live: build-e2e ## Run live API voice e2e tests only (Anthropic, OpenAI, Gemini)
	npx playwright test --config=playwright.config.e2e-live.ts e2e/providers-api.e2e-live.test.ts

.PHONY: test-e2e-cli-live
test-e2e-cli-live: build-e2e ## Run live CLI voice e2e tests only (Anthropic CLI, OpenAI CLI, Copilot CLI)
	npx playwright test --config=playwright.config.e2e-live.ts e2e/providers-cli.e2e-live.test.ts

.PHONY: test-e2e-mixed-live
test-e2e-mixed-live: build-e2e ## Run live mixed API+CLI voice e2e tests only
	npx playwright test --config=playwright.config.e2e-live.ts e2e/providers-mixed.e2e-live.test.ts

.PHONY: test-e2e-search-live
test-e2e-search-live: build-e2e ## Run live search e2e tests only (requires Anthropic API key)
	npx playwright test --config=playwright.config.e2e-live.ts e2e/search.e2e-live.test.ts

.PHONY: test-e2e-encryption-live
test-e2e-encryption-live: build-e2e ## Run live encryption e2e tests only
	npx playwright test --config=playwright.config.e2e-live.ts e2e/encryption.e2e-live.test.ts

.PHONY: test-e2e-mcp-live
test-e2e-mcp-live: build-e2e ## Run live MCP server e2e tests only (requires claude CLI)
	npx playwright test --config=playwright.config.e2e-live.ts e2e/mcp.e2e-live.test.ts

.PHONY: test-openai-compatible-live
test-openai-compatible-live: build-e2e ## Run live e2e tests against Ollama in Docker — requires Docker
	npx playwright test --config=playwright.config.openai-compatible.ts

.PHONY: test-watch
test-watch: ## Run Vitest in watch mode
	npm run test:watch

.PHONY: lint
lint: lint-dead lint-dupes ## TypeScript type-check (no emit)
	npm run lint

.PHONY: lint-dead
lint-dead: ## Find dead/orphaned code (knip) — run periodically; not yet in make test
	npx knip --no-progress

.PHONY: lint-dupes
lint-dupes: ## Find duplicate code (jscpd) — run periodically; not yet in make test
	npx jscpd src

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

##@ Release

.PHONY: publish
publish: ## Build, sign, notarize, and publish to GitHub releases — requires Apple creds (see .env.release.example)
	@set -e; \
	[ -f .env.release ] && set -a && . ./.env.release && set +a || true; \
	[ -z "$$APPLE_SIGNING_IDENTITY" ] && echo "ERROR: APPLE_SIGNING_IDENTITY not set" && exit 1 || true; \
	[ -z "$$APPLE_ID" ]               && echo "ERROR: APPLE_ID not set"               && exit 1 || true; \
	[ -z "$$APPLE_APP_SPECIFIC_PASSWORD" ] && echo "ERROR: APPLE_APP_SPECIFIC_PASSWORD not set" && exit 1 || true; \
	[ -z "$$APPLE_TEAM_ID" ]          && echo "ERROR: APPLE_TEAM_ID not set"          && exit 1 || true; \
	npm run make -- --arch arm64; \
	VERSION=$$(node -p "require('./package.json').version"); \
	ZIP_PATH=$$(find out/make/zip/darwin/arm64 -name "*.zip" | head -1); \
	node scripts/generate-update-metadata.mjs "$$ZIP_PATH" "$$VERSION"; \
	DMG_PATH=$$(find out/make -maxdepth 1 -name "*.dmg" | head -1); \
	gh release create "v$$VERSION" \
	  --repo polyphon-ai/releases \
	  --title "v$$VERSION" \
	  --notes-file RELEASE_NOTES.md \
	  --prerelease \
	  "$$DMG_PATH" \
	  "$$ZIP_PATH" \
	  "out/make/zip/darwin/arm64/latest-mac.yml"

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
screenshots: build-e2e ## Capture site screenshots
	npx tsx scripts/take-screenshots.ts

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
