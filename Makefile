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
test: lint test-unit test-integration test-e2e ## Run lint then all non-live tests (unit + integration + e2e)

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

# ─── VM Test Targets ──────────────────────────────────────────────────────────
# Runs the full test suite on remote Linux Server and Windows Server 2022 VMs.
# Mirrors the GitHub CI matrix as closely as possible without using CI credits.
#
# Usage:
#   make vm-linux-test  LINUX_VM_USER=corey  LINUX_VM_HOST=192.168.64.10
#   make vm-windows-test WINDOWS_VM_USER=corey WINDOWS_VM_HOST=192.168.64.20
#   make test-vm         LINUX_VM_USER=...    WINDOWS_VM_USER=...   # both
#
# Auto-start/suspend (UTM only — requires utmctl in PATH):
#   Set LINUX_VM_NAME / WINDOWS_VM_NAME to the exact VM name shown in UTM.
#   When set, the target starts the VM, waits for SSH, runs tests, then suspends.
#   Standalone targets: vm-linux-start, vm-linux-stop, vm-windows-start, vm-windows-stop
#
# Prerequisites:
#   - SSH key auth configured on both VMs (no password prompts).
#   - Run `make vm-linux-provision` / `make vm-windows-provision` once first.
#   - Windows: Git for Windows must be installed before provisioning.

LINUX_VM_USER  ?= corey
LINUX_VM_HOST  ?= 192.168.64.7
LINUX_VM_PATH  ?= ~/polyphon
LINUX_VM_NAME  ?= "Polyphon CI - Linux"

WINDOWS_VM_USER ?= corey
WINDOWS_VM_HOST ?= 192.168.64.6
WINDOWS_VM_PATH ?= ~/polyphon
WINDOWS_VM_NAME ?= "Polyphon CI - Windows"

_LINUX_VM  := $(LINUX_VM_USER)@$(LINUX_VM_HOST)
_WINDOWS_VM := $(WINDOWS_VM_USER)@$(WINDOWS_VM_HOST)

_VM_RSYNC_OPTS := -az --delete \
	--exclude=node_modules \
	--exclude=out \
	--exclude=.vite \
	--exclude=.git \
	--exclude=.dev-data \
	--exclude=test-results \
	--exclude=playwright-report

# ── UTM VM lifecycle ──────────────────────────────────────────────────────────

.PHONY: vm-linux-start
vm-linux-start: ## Start the UTM Linux VM and wait for SSH (requires LINUX_VM_NAME)
	@[ -n "$(LINUX_VM_NAME)" ] || { echo "ERROR: Set LINUX_VM_NAME to the UTM VM name."; exit 1; }
	@echo "==> Starting UTM VM '$(LINUX_VM_NAME)'..."
	@utmctl start "$(LINUX_VM_NAME)" 2>/dev/null || true
	@printf "==> Waiting for SSH ($(_LINUX_VM))"; \
	for i in $$(seq 1 60); do \
		ssh -o ConnectTimeout=3 -o BatchMode=yes $(_LINUX_VM) true 2>/dev/null \
			&& printf " ready.\n" && exit 0; \
		printf "."; sleep 3; \
	done; echo ""; echo "ERROR: VM did not become reachable after 3 minutes."; exit 1

.PHONY: vm-linux-stop
vm-linux-stop: ## Suspend the UTM Linux VM (requires LINUX_VM_NAME)
	@[ -n "$(LINUX_VM_NAME)" ] || { echo "ERROR: Set LINUX_VM_NAME to the UTM VM name."; exit 1; }
	@echo "==> Suspending UTM VM '$(LINUX_VM_NAME)'..."
	@utmctl suspend "$(LINUX_VM_NAME)" 2>/dev/null || true

.PHONY: vm-windows-start
vm-windows-start: ## Start the UTM Windows VM and wait for SSH (requires WINDOWS_VM_NAME)
	@[ -n "$(WINDOWS_VM_NAME)" ] || { echo "ERROR: Set WINDOWS_VM_NAME to the UTM VM name."; exit 1; }
	@echo "==> Starting UTM VM '$(WINDOWS_VM_NAME)'..."
	@utmctl start "$(WINDOWS_VM_NAME)" 2>/dev/null || true
	@printf "==> Waiting for SSH ($(_WINDOWS_VM))"; \
	for i in $$(seq 1 60); do \
		ssh -o ConnectTimeout=3 -o BatchMode=yes $(_WINDOWS_VM) "echo ok" 2>/dev/null | grep -q ok \
			&& printf " ready.\n" && exit 0; \
		printf "."; sleep 3; \
	done; echo ""; echo "ERROR: VM did not become reachable after 3 minutes."; exit 1

.PHONY: vm-windows-stop
vm-windows-stop: ## Suspend the UTM Windows VM (requires WINDOWS_VM_NAME)
	@[ -n "$(WINDOWS_VM_NAME)" ] || { echo "ERROR: Set WINDOWS_VM_NAME to the UTM VM name."; exit 1; }
	@echo "==> Suspending UTM VM '$(WINDOWS_VM_NAME)'..."
	@utmctl suspend "$(WINDOWS_VM_NAME)" 2>/dev/null || true

# ── Linux ─────────────────────────────────────────────────────────────────────

.PHONY: vm-linux-provision
vm-linux-provision: ## Provision Linux VM: install Node 24 + system deps for Electron and Playwright
	@echo "==> Checking SSH connectivity ($(_LINUX_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_LINUX_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify LINUX_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Installing system packages..."
	@ssh $(_LINUX_VM) 'sudo apt-get update -y && sudo apt-get install -y \
		curl rsync libgtk-3-0 libgbm1 libnss3 libasound2t64 libxshmfence1 xvfb'
	@echo "==> Checking Node.js 24..."
	@ssh $(_LINUX_VM) 'node --version 2>/dev/null | grep -q "^v24" || { \
		curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && \
		sudo apt-get install -y nodejs; }'
	@echo "==> Updating npm to latest..."
	@ssh $(_LINUX_VM) 'sudo npm install -g npm@latest'
	@echo "==> Linux VM provisioned."

.PHONY: vm-linux-test
vm-linux-test: ## Sync project to Linux VM and run lint + unit + integration + e2e
	@[ -z "$(LINUX_VM_NAME)" ] || { \
		echo "==> Starting UTM VM '$(LINUX_VM_NAME)'..."; \
		utmctl start "$(LINUX_VM_NAME)" 2>/dev/null || true; \
		printf "==> Waiting for SSH ($(_LINUX_VM))"; \
		for i in $$(seq 1 60); do \
			ssh -o ConnectTimeout=3 -o BatchMode=yes $(_LINUX_VM) true 2>/dev/null \
				&& printf " ready.\n" && break; \
			printf "."; sleep 3; \
		done; \
	}
	@echo "==> Checking SSH connectivity ($(_LINUX_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_LINUX_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify LINUX_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node 24 (run 'make vm-linux-provision' if missing)..."
	@ssh $(_LINUX_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Linux VM. Run: make vm-linux-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_LINUX_VM):$(LINUX_VM_PATH)/
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm ci'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run lint'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run test:unit'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run test:integration'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run build:e2e'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && CI=1 xvfb-run --auto-servernum --server-args="-screen 0 1280x720x16" npx playwright test'
	@[ -z "$(LINUX_VM_NAME)" ] || utmctl suspend "$(LINUX_VM_NAME)" 2>/dev/null || true

# ── Windows ───────────────────────────────────────────────────────────────────
# Provision configures Git Bash as the OpenSSH default shell so that all
# subsequent SSH commands can use Unix-style paths and pipelines consistently.
# Git for Windows must be installed manually before running vm-windows-provision.

.PHONY: vm-windows-provision
vm-windows-provision: ## Provision Windows VM: verify Node 24 + Git for Windows, configure Git Bash as SSH shell
	@echo "==> Checking SSH connectivity ($(_WINDOWS_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_WINDOWS_VM) "echo ok" 2>/dev/null | grep -q ok || \
		{ echo "ERROR: SSH failed. Verify WINDOWS_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node.js 24..."
	@ssh $(_WINDOWS_VM) "node --version" 2>/dev/null | grep -q "v24" || \
		{ echo "ERROR: Node 24 not found. Install via: winget install OpenJS.NodeJS.LTS"; exit 1; }
	@echo "==> Checking Git for Windows (required for rsync and bash)..."
	@ssh $(_WINDOWS_VM) "git --version" 2>/dev/null | grep -q "git version" || \
		{ echo "ERROR: Git for Windows not found. Install from https://git-scm.com/download/win"; exit 1; }
	@echo "==> Checking rsync (bundled with Git for Windows)..."
	@ssh $(_WINDOWS_VM) "rsync --version" 2>/dev/null | grep -q "rsync" || \
		{ echo "ERROR: rsync not found. Ensure Git for Windows is installed and includes rsync."; exit 1; }
	@echo "==> Configuring Git Bash as the OpenSSH default shell..."
	@ssh $(_WINDOWS_VM) "powershell -NoProfile -Command \"New-ItemProperty -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Name DefaultShell -Value 'C:\\Program Files\\Git\\bin\\bash.exe' -PropertyType String -Force\""
	@echo "==> Windows VM provisioned. Future SSH connections will use Git Bash."

.PHONY: vm-windows-test
vm-windows-test: ## Sync project to Windows VM and run lint + unit + integration + e2e (requires vm-windows-provision)
	@[ -z "$(WINDOWS_VM_NAME)" ] || { \
		echo "==> Starting UTM VM '$(WINDOWS_VM_NAME)'..."; \
		utmctl start "$(WINDOWS_VM_NAME)" 2>/dev/null || true; \
		printf "==> Waiting for SSH ($(_WINDOWS_VM))"; \
		for i in $$(seq 1 60); do \
			ssh -o ConnectTimeout=3 -o BatchMode=yes $(_WINDOWS_VM) "echo ok" 2>/dev/null | grep -q ok \
				&& printf " ready.\n" && break; \
			printf "."; sleep 3; \
		done; \
	}
	@echo "==> Checking SSH connectivity ($(_WINDOWS_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_WINDOWS_VM) "echo ok" 2>/dev/null | grep -q ok || \
		{ echo "ERROR: SSH failed. Verify WINDOWS_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node 24 (run 'make vm-windows-provision' if missing)..."
	@ssh $(_WINDOWS_VM) "node --version" 2>/dev/null | grep -q "v24" || \
		{ echo "ERROR: Node 24 not found on Windows VM. Run: make vm-windows-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_WINDOWS_VM):$(WINDOWS_VM_PATH)/
	@ssh $(_WINDOWS_VM) 'taskkill //F //IM electron.exe 2>/dev/null; cd $(WINDOWS_VM_PATH) && rm -rf node_modules && npm ci'
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npx playwright install --with-deps chromium'
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npm run lint'
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npm run test:unit'
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npm run test:integration'
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npm run build:e2e'
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && CI=1 npx playwright test'
	@[ -z "$(WINDOWS_VM_NAME)" ] || utmctl suspend "$(WINDOWS_VM_NAME)" 2>/dev/null || true

# ── Both ──────────────────────────────────────────────────────────────────────

.PHONY: vm-test
vm-test: vm-linux-test vm-windows-test ## Run full test suite on both Linux and Windows VMs (sequential)

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
