.DEFAULT_GOAL := help

# ── VM configuration ──────────────────────────────────────────────────────────
# Override any of these on the command line, e.g.:
#   make vm-ubuntu-test LINUX_VM_HOST=192.168.64.10
#
# *_VM_NAME variables enable UTM auto-start/suspend (requires utmctl in PATH).
# When set the target starts the VM, waits for SSH, runs, then suspends.
# Leave unset to skip UTM lifecycle management.
#
# Prerequisites: run vm-ubuntu-provision / vm-fedora-provision /
# vm-windows-provision once first.
# Windows: Git for Windows must be installed before provisioning.

WINDOWS_VM_USER ?= corey
WINDOWS_VM_HOST ?= 192.168.64.6
WINDOWS_VM_PATH ?= ~/polyphon
WINDOWS_VM_NAME ?= Polyphon CI - Windows

LINUX_VM_USER  ?= corey
LINUX_VM_HOST  ?= 192.168.64.7
LINUX_VM_PATH  ?= ~/polyphon
LINUX_VM_NAME  ?= Polyphon CI - Ubuntu

FEDORA_VM_USER ?= corey
FEDORA_VM_HOST ?= 192.168.64.8
FEDORA_VM_PATH ?= ~/polyphon
FEDORA_VM_NAME ?= Polyphon CI - Fedora



_LINUX_VM   := $(LINUX_VM_USER)@$(LINUX_VM_HOST)
_FEDORA_VM  := $(FEDORA_VM_USER)@$(FEDORA_VM_HOST)
_WINDOWS_VM := $(WINDOWS_VM_USER)@$(WINDOWS_VM_HOST)

_VM_RSYNC_OPTS := -az --delete \
	--exclude=node_modules \
	--exclude=out \
	--exclude=.vite \
	--exclude=.git \
	--exclude=.dev-data \
	--exclude=.venv \
	--exclude=test-results \
	--exclude=playwright-report

# ─────────────────────────────────────────────────────────────────────────────

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

.PHONY: dev
dev: ## Start the Electron app in development mode (hot reload)
	POLYPHON_TEST_USER_DATA=$(CURDIR)/.dev-data ELECTRON_DISABLE_SECURITY_WARNINGS=true npm start

.PHONY: run
run: dev ## Alias for dev

##@ Build

.PHONY: build
build: build-app ## Package the app (no installer)

.PHONY: build-app
build-app: ## Package the Electron app with Electron Forge
	npm run package

.PHONY: dist
dist: ## Build installer for the current platform and arch
	npm run make

.PHONY: dist-macos
dist-macos: ## Build macOS arm64 + x64 DMGs locally; output to out/make/
	npm run make -- --arch arm64
	npm run make -- --arch x64

.PHONY: dist-linux-arm64
dist-linux-arm64: ## Build Linux arm64 packages (.deb/.rpm) via Docker (no Linux VM required)
	docker run --rm \
		--platform linux/arm64 \
		-v "$(CURDIR):/workspace" \
		-v polyphon-nm-linux-arm64:/workspace/node_modules \
		-w /workspace \
		node:22-bookworm \
		sh -c "apt-get update -q && apt-get install -y -q rpm && npm ci && npm run make -- --arch arm64"

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
lint: lint-ts ## Run all linters

.PHONY: lint-ts
lint-ts: ## TypeScript type-check (no emit)
	npm run lint

##@ Docker

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

##@ Virtual Machines

.PHONY: vm-ubuntu-start
vm-ubuntu-start: ## Start the UTM Linux VM and wait for SSH (requires LINUX_VM_NAME)
	@[ -n "$(LINUX_VM_NAME)" ] || { echo "ERROR: Set LINUX_VM_NAME to the UTM VM name."; exit 1; }
	@echo "==> Starting UTM VM '$(LINUX_VM_NAME)'..."
	@utmctl start "$(LINUX_VM_NAME)" 2>/dev/null || true
	@printf "==> Waiting for SSH ($(_LINUX_VM))"; \
	for i in $$(seq 1 60); do \
		ssh -o ConnectTimeout=3 -o BatchMode=yes $(_LINUX_VM) true 2>/dev/null \
			&& printf " ready.\n" && exit 0; \
		printf "."; sleep 3; \
	done; echo ""; echo "ERROR: VM did not become reachable after 3 minutes."; exit 1

.PHONY: vm-ubuntu-stop
vm-ubuntu-stop: ## Suspend the UTM Linux VM (requires LINUX_VM_NAME)
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

.PHONY: vm-ubuntu-provision
vm-ubuntu-provision: ## Provision Linux VM: install Node 24 + system deps for Electron and Playwright
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

.PHONY: vm-ubuntu-test
vm-ubuntu-test: ## Sync project to Linux VM and run lint + unit + integration + e2e
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
	@echo "==> Checking Node 24 (run 'make vm-ubuntu-provision' if missing)..."
	@ssh $(_LINUX_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Linux VM. Run: make vm-ubuntu-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_LINUX_VM):$(LINUX_VM_PATH)/
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm ci'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run lint'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run test:unit'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run test:integration'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run build:e2e'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && CI=1 xvfb-run --auto-servernum --server-args="-screen 0 1280x720x16" npx playwright test'
	@[ -z "$(LINUX_VM_NAME)" ] || utmctl suspend "$(LINUX_VM_NAME)" 2>/dev/null || true

.PHONY: vm-ubuntu-test-unit
vm-ubuntu-test-unit: ## Sync project to Linux VM and run unit tests only
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
	@echo "==> Checking Node 24 (run 'make vm-ubuntu-provision' if missing)..."
	@ssh $(_LINUX_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Linux VM. Run: make vm-ubuntu-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_LINUX_VM):$(LINUX_VM_PATH)/
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm ci'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run test:unit'
	@[ -z "$(LINUX_VM_NAME)" ] || utmctl suspend "$(LINUX_VM_NAME)" 2>/dev/null || true

.PHONY: vm-ubuntu-test-integration
vm-ubuntu-test-integration: ## Sync project to Linux VM and run integration tests only
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
	@echo "==> Checking Node 24 (run 'make vm-ubuntu-provision' if missing)..."
	@ssh $(_LINUX_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Linux VM. Run: make vm-ubuntu-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_LINUX_VM):$(LINUX_VM_PATH)/
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm ci'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run test:integration'
	@[ -z "$(LINUX_VM_NAME)" ] || utmctl suspend "$(LINUX_VM_NAME)" 2>/dev/null || true

.PHONY: vm-ubuntu-test-e2e
vm-ubuntu-test-e2e: ## Sync project to Linux VM and run e2e tests only
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
	@echo "==> Checking Node 24 (run 'make vm-ubuntu-provision' if missing)..."
	@ssh $(_LINUX_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Linux VM. Run: make vm-ubuntu-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_LINUX_VM):$(LINUX_VM_PATH)/
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm ci'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run build:e2e'
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && CI=1 xvfb-run --auto-servernum --server-args="-screen 0 1280x720x16" npx playwright test'
	@[ -z "$(LINUX_VM_NAME)" ] || utmctl suspend "$(LINUX_VM_NAME)" 2>/dev/null || true

.PHONY: vm-windows-test
vm-windows-test: ## Sync project to Windows VM and run lint + unit + integration + e2e
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

.PHONY: vm-windows-test-unit
vm-windows-test-unit: ## Sync project to Windows VM and run unit tests only
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
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npm run test:unit'
	@[ -z "$(WINDOWS_VM_NAME)" ] || utmctl suspend "$(WINDOWS_VM_NAME)" 2>/dev/null || true

.PHONY: vm-windows-test-integration
vm-windows-test-integration: ## Sync project to Windows VM and run integration tests only
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
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npm run test:integration'
	@[ -z "$(WINDOWS_VM_NAME)" ] || utmctl suspend "$(WINDOWS_VM_NAME)" 2>/dev/null || true

.PHONY: vm-windows-test-e2e
vm-windows-test-e2e: ## Sync project to Windows VM and run e2e tests only
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
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && npm run build:e2e'
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && CI=1 npx playwright test'
	@[ -z "$(WINDOWS_VM_NAME)" ] || utmctl suspend "$(WINDOWS_VM_NAME)" 2>/dev/null || true

.PHONY: vm-test
vm-test: vm-ubuntu-test vm-fedora-test vm-windows-test ## Run full test suite on all VMs (sequential)

.PHONY: vm-ubuntu-dist
vm-ubuntu-dist: ## Build Linux x64 + arm64 packages (.deb/.flatpak) on the Linux VM; fetch to out/dist/linux/
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
	@echo "==> Checking Node 24 (run 'make vm-ubuntu-provision' if missing)..."
	@ssh $(_LINUX_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Linux VM. Run: make vm-ubuntu-provision"; exit 1; }
	@echo "==> Installing build dependencies..."
	@ssh $(_LINUX_VM) 'sudo apt-get update -q && sudo apt-get install -y -q libgtk-3-0 libgbm1 libnss3 libasound2t64 libxshmfence1 flatpak flatpak-builder elfutils dpkg fakeroot'
	@echo "==> Setting up Flatpak runtimes..."
	@ssh $(_LINUX_VM) 'flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo'
	@ssh $(_LINUX_VM) 'flatpak install --user --noninteractive --or-update flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08 org.electronjs.Electron2.BaseApp//24.08'
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_LINUX_VM):$(LINUX_VM_PATH)/
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm ci'
	@echo "==> Building Linux x64 .deb..."
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run make -- --arch x64 --targets @electron-forge/maker-deb'
	@echo "==> Building Linux arm64 .deb..."
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && npm run make -- --arch arm64 --targets @electron-forge/maker-deb'
	@echo "==> Building Linux x64 Flatpak..."
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && DEBUG="@malept/flatpak-bundler" npm run make -- --arch x64 --targets @electron-forge/maker-flatpak'
	@echo "==> Building Linux arm64 Flatpak..."
	@ssh $(_LINUX_VM) 'cd $(LINUX_VM_PATH) && DEBUG="@malept/flatpak-bundler" npm run make -- --arch arm64 --targets @electron-forge/maker-flatpak'
	@echo "==> Fetching artifacts..."
	@mkdir -p "$(CURDIR)/out/dist/linux"
	@rsync -az $(_LINUX_VM):$(LINUX_VM_PATH)/out/make/ "$(CURDIR)/out/dist/linux/"
	@echo "==> Artifacts in out/dist/linux/"
	@[ -z "$(LINUX_VM_NAME)" ] || utmctl suspend "$(LINUX_VM_NAME)" 2>/dev/null || true

.PHONY: vm-windows-dist
vm-windows-dist: ## Build Windows x64 + arm64 installers on the Windows VM; fetch to out/dist/windows/
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
	@ssh $(_WINDOWS_VM) 'taskkill //F //IM electron.exe 2>/dev/null; cd $(WINDOWS_VM_PATH) && rm -rf node_modules && npm install'
	@echo "==> Building Windows x64 installer..."
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && BUILD_ARCH=x64 npm run make -- --arch x64'
	@echo "==> Building Windows arm64 installer..."
	@ssh $(_WINDOWS_VM) 'cd $(WINDOWS_VM_PATH) && BUILD_ARCH=arm64 npm run make -- --arch arm64'
	@echo "==> Fetching artifacts..."
	@mkdir -p "$(CURDIR)/out/dist/windows"
	@rsync -az $(_WINDOWS_VM):$(WINDOWS_VM_PATH)/out/make/ "$(CURDIR)/out/dist/windows/"
	@echo "==> Artifacts in out/dist/windows/"
	@[ -z "$(WINDOWS_VM_NAME)" ] || utmctl suspend "$(WINDOWS_VM_NAME)" 2>/dev/null || true

.PHONY: vm-fedora-start
vm-fedora-start: ## Start the UTM Fedora VM and wait for SSH (requires FEDORA_VM_NAME)
	@[ -n "$(FEDORA_VM_NAME)" ] || { echo "ERROR: Set FEDORA_VM_NAME to the UTM VM name."; exit 1; }
	@echo "==> Starting UTM VM '$(FEDORA_VM_NAME)'..."
	@utmctl start "$(FEDORA_VM_NAME)" 2>/dev/null || true
	@printf "==> Waiting for SSH ($(_FEDORA_VM))"; \
	for i in $$(seq 1 60); do \
		ssh -o ConnectTimeout=3 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null \
			&& printf " ready.\n" && exit 0; \
		printf "."; sleep 3; \
	done; echo ""; echo "ERROR: VM did not become reachable after 3 minutes."; exit 1

.PHONY: vm-fedora-stop
vm-fedora-stop: ## Suspend the UTM Fedora VM (requires FEDORA_VM_NAME)
	@[ -n "$(FEDORA_VM_NAME)" ] || { echo "ERROR: Set FEDORA_VM_NAME to the UTM VM name."; exit 1; }
	@echo "==> Suspending UTM VM '$(FEDORA_VM_NAME)'..."
	@utmctl suspend "$(FEDORA_VM_NAME)" 2>/dev/null || true

.PHONY: vm-fedora-provision
vm-fedora-provision: ## Provision Fedora VM: install Node 24 + system deps for Electron and Playwright
	@echo "==> Checking SSH connectivity ($(_FEDORA_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify FEDORA_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Installing system packages..."
	@ssh $(_FEDORA_VM) 'sudo dnf install -y \
		curl rsync gtk3 mesa-libgbm nss alsa-lib libxshmfence xorg-x11-server-Xvfb rpm-build'
	@echo "==> Checking Node.js 24..."
	@ssh $(_FEDORA_VM) 'node --version 2>/dev/null | grep -q "^v24" || { \
		curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash - && \
		sudo dnf install -y nodejs; }'
	@echo "==> Updating npm to latest..."
	@ssh $(_FEDORA_VM) 'sudo npm install -g npm@latest'
	@echo "==> Fedora VM provisioned."

.PHONY: vm-fedora-test
vm-fedora-test: ## Sync project to Fedora VM and run lint + unit + integration + e2e
	@[ -z "$(FEDORA_VM_NAME)" ] || { \
		echo "==> Starting UTM VM '$(FEDORA_VM_NAME)'..."; \
		utmctl start "$(FEDORA_VM_NAME)" 2>/dev/null || true; \
		printf "==> Waiting for SSH ($(_FEDORA_VM))"; \
		for i in $$(seq 1 60); do \
			ssh -o ConnectTimeout=3 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null \
				&& printf " ready.\n" && break; \
			printf "."; sleep 3; \
		done; \
	}
	@echo "==> Checking SSH connectivity ($(_FEDORA_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify FEDORA_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node 24 (run 'make vm-fedora-provision' if missing)..."
	@ssh $(_FEDORA_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Fedora VM. Run: make vm-fedora-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_FEDORA_VM):$(FEDORA_VM_PATH)/
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm ci'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run lint'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run test:unit'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run test:integration'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run build:e2e'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && CI=1 xvfb-run --auto-servernum --server-args="-screen 0 1280x720x16" npx playwright test'
	@[ -z "$(FEDORA_VM_NAME)" ] || utmctl suspend "$(FEDORA_VM_NAME)" 2>/dev/null || true

.PHONY: vm-fedora-test-unit
vm-fedora-test-unit: ## Sync project to Fedora VM and run unit tests only
	@[ -z "$(FEDORA_VM_NAME)" ] || { \
		echo "==> Starting UTM VM '$(FEDORA_VM_NAME)'..."; \
		utmctl start "$(FEDORA_VM_NAME)" 2>/dev/null || true; \
		printf "==> Waiting for SSH ($(_FEDORA_VM))"; \
		for i in $$(seq 1 60); do \
			ssh -o ConnectTimeout=3 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null \
				&& printf " ready.\n" && break; \
			printf "."; sleep 3; \
		done; \
	}
	@echo "==> Checking SSH connectivity ($(_FEDORA_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify FEDORA_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node 24 (run 'make vm-fedora-provision' if missing)..."
	@ssh $(_FEDORA_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Fedora VM. Run: make vm-fedora-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_FEDORA_VM):$(FEDORA_VM_PATH)/
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm ci'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run test:unit'
	@[ -z "$(FEDORA_VM_NAME)" ] || utmctl suspend "$(FEDORA_VM_NAME)" 2>/dev/null || true

.PHONY: vm-fedora-test-integration
vm-fedora-test-integration: ## Sync project to Fedora VM and run integration tests only
	@[ -z "$(FEDORA_VM_NAME)" ] || { \
		echo "==> Starting UTM VM '$(FEDORA_VM_NAME)'..."; \
		utmctl start "$(FEDORA_VM_NAME)" 2>/dev/null || true; \
		printf "==> Waiting for SSH ($(_FEDORA_VM))"; \
		for i in $$(seq 1 60); do \
			ssh -o ConnectTimeout=3 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null \
				&& printf " ready.\n" && break; \
			printf "."; sleep 3; \
		done; \
	}
	@echo "==> Checking SSH connectivity ($(_FEDORA_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify FEDORA_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node 24 (run 'make vm-fedora-provision' if missing)..."
	@ssh $(_FEDORA_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Fedora VM. Run: make vm-fedora-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_FEDORA_VM):$(FEDORA_VM_PATH)/
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm ci'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run test:integration'
	@[ -z "$(FEDORA_VM_NAME)" ] || utmctl suspend "$(FEDORA_VM_NAME)" 2>/dev/null || true

.PHONY: vm-fedora-test-e2e
vm-fedora-test-e2e: ## Sync project to Fedora VM and run e2e tests only
	@[ -z "$(FEDORA_VM_NAME)" ] || { \
		echo "==> Starting UTM VM '$(FEDORA_VM_NAME)'..."; \
		utmctl start "$(FEDORA_VM_NAME)" 2>/dev/null || true; \
		printf "==> Waiting for SSH ($(_FEDORA_VM))"; \
		for i in $$(seq 1 60); do \
			ssh -o ConnectTimeout=3 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null \
				&& printf " ready.\n" && break; \
			printf "."; sleep 3; \
		done; \
	}
	@echo "==> Checking SSH connectivity ($(_FEDORA_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify FEDORA_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node 24 (run 'make vm-fedora-provision' if missing)..."
	@ssh $(_FEDORA_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Fedora VM. Run: make vm-fedora-provision"; exit 1; }
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_FEDORA_VM):$(FEDORA_VM_PATH)/
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm ci'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run build:e2e'
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && CI=1 xvfb-run --auto-servernum --server-args="-screen 0 1280x720x16" npx playwright test'
	@[ -z "$(FEDORA_VM_NAME)" ] || utmctl suspend "$(FEDORA_VM_NAME)" 2>/dev/null || true

.PHONY: vm-fedora-dist
vm-fedora-dist: ## Build Linux x64 + arm64 RPM + Flatpak packages on the Fedora VM; fetch to out/dist/linux/
	@[ -z "$(FEDORA_VM_NAME)" ] || { \
		echo "==> Starting UTM VM '$(FEDORA_VM_NAME)'..."; \
		utmctl start "$(FEDORA_VM_NAME)" 2>/dev/null || true; \
		printf "==> Waiting for SSH ($(_FEDORA_VM))"; \
		for i in $$(seq 1 60); do \
			ssh -o ConnectTimeout=3 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null \
				&& printf " ready.\n" && break; \
			printf "."; sleep 3; \
		done; \
	}
	@echo "==> Checking SSH connectivity ($(_FEDORA_VM))..."
	@ssh -o ConnectTimeout=10 -o BatchMode=yes $(_FEDORA_VM) true 2>/dev/null || \
		{ echo "ERROR: SSH failed. Verify FEDORA_VM_USER/HOST and ensure SSH key auth is configured."; exit 1; }
	@echo "==> Checking Node 24 (run 'make vm-fedora-provision' if missing)..."
	@ssh $(_FEDORA_VM) 'node --version 2>/dev/null | grep -q "^v24"' || \
		{ echo "ERROR: Node 24 not found on Fedora VM. Run: make vm-fedora-provision"; exit 1; }
	@echo "==> Installing build dependencies..."
	@ssh $(_FEDORA_VM) 'sudo dnf install -y gtk3 mesa-libgbm nss alsa-lib libxshmfence rpm-build flatpak flatpak-builder elfutils'
	@echo "==> Setting up Flatpak runtimes..."
	@ssh $(_FEDORA_VM) 'flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo'
	@ssh $(_FEDORA_VM) 'flatpak install --user --noninteractive --or-update flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08 org.electronjs.Electron2.BaseApp//24.08'
	@echo "==> Syncing project..."
	@rsync $(_VM_RSYNC_OPTS) . $(_FEDORA_VM):$(FEDORA_VM_PATH)/
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm ci'
	@echo "==> Building Linux x64 RPM..."
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run make -- --arch x64 --targets @electron-forge/maker-rpm'
	@echo "==> Building Linux arm64 RPM..."
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run make -- --arch arm64 --targets @electron-forge/maker-rpm'
	@echo "==> Building Linux x64 Flatpak..."
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run make -- --arch x64 --targets @electron-forge/maker-flatpak'
	@echo "==> Building Linux arm64 Flatpak..."
	@ssh $(_FEDORA_VM) 'cd $(FEDORA_VM_PATH) && npm run make -- --arch arm64 --targets @electron-forge/maker-flatpak'
	@echo "==> Fetching artifacts..."
	@mkdir -p "$(CURDIR)/out/dist/linux"
	@rsync -az $(_FEDORA_VM):$(FEDORA_VM_PATH)/out/make/ "$(CURDIR)/out/dist/linux/"
	@echo "==> Artifacts in out/dist/linux/"
	@[ -z "$(FEDORA_VM_NAME)" ] || utmctl suspend "$(FEDORA_VM_NAME)" 2>/dev/null || true

.PHONY: vm-dist
vm-dist: vm-ubuntu-dist vm-fedora-dist vm-windows-dist ## Build all Linux + Windows installers on all VMs (sequential)

##@ Icons

.PHONY: icons
icons: icon-generate icon-light-generate ## Generate all platform icons for dark and light variants

.PHONY: icon-rasterize
icon-rasterize: ## Convert icon-dark.svg to a 1024x1024 PNG (requires rsvg-convert)
	rsvg-convert -w 1024 -h 1024 assets/icon-dark.svg -o assets/icon-1024.png

.PHONY: icon-generate
icon-generate: icon-rasterize ## Generate platform icon formats from icon-dark.svg (requires electron-icon-maker)
	npx electron-icon-maker --input=assets/icon-1024.png --output=assets/icons

.PHONY: icon-light-rasterize
icon-light-rasterize: ## Convert icon-light.svg to a 1024x1024 PNG (requires rsvg-convert)
	rsvg-convert -w 1024 -h 1024 assets/icon-light.svg -o assets/icon-light-1024.png

.PHONY: icon-light-generate
icon-light-generate: icon-light-rasterize ## Generate platform icon formats from icon-light.svg (requires electron-icon-maker)
	npx electron-icon-maker --input=assets/icon-light-1024.png --output=assets/icons-light

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
