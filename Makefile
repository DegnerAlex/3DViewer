# Copyright 2026 Alex Degner (alex@ergofox.me)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# 3D Viewer — build commands.
#
# The project builds inside Docker (see docker-compose.yaml): the `frontend`
# service provides node/pnpm for the web bundle, the `viewer3d` service
# provides cargo + the Tauri CLI with all Linux/GTK dependencies.

COMPOSE := docker compose
VIEWER  := $(COMPOSE) run --rm --no-deps --entrypoint "" viewer3d

# Release version from the Tauri config; override with VERSION=x.y.z if needed.
TAURI_CONF := viewer3d/src-tauri/tauri.conf.json
VERSION ?= $(shell python3 -c "import json; print(json.load(open('$(TAURI_CONF)'))['version'])")

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.PHONY: dev
dev: ## Run the app in dev mode (watch frontend + Rust)
	$(COMPOSE) up

.PHONY: frontend
frontend: ## Build the web bundle (viewer3d/dist)
	$(COMPOSE) run --rm --no-deps frontend sh -c "npx tsc --noEmit && npx vite build"

.PHONY: check
check: ## Type-check the frontend and cargo check the Rust code
	$(COMPOSE) run --rm --no-deps frontend sh -c "npx tsc --noEmit"
	$(VIEWER) bash -c "cd /srv/src-tauri && cargo check -j 2"

.PHONY: clean
clean: ## Remove build artifacts (dist, target/debug, target/release) and stop containers
	$(VIEWER) bash -c "rm -rf /srv/dist /srv/src-tauri/target/debug /srv/src-tauri/target/release && echo 'Cleaned: dist, src-tauri/target/{debug,release}'"
	$(COMPOSE) down --remove-orphans
	$(COMPOSE) run --rm --no-deps frontend sh -c "rm -rf /srv/node_modules && echo 'Cleaned: node_modules'"

.PHONY: distclean
distclean: ## Clean + remove built Docker images as well
	$(MAKE) clean
	$(COMPOSE) config --images | xargs -r docker rmi

.PHONY: appimage
appimage: ## Build the release AppImage (output in viewer3d/src-tauri/target/release/bundle/appimage/)
	$(VIEWER) bash -c "cd /srv && cargo tauri build"

# Bundle globs: patterns contain no spaces (results do, hence the bash-array
# quoting in the release/upload recipes). Deferred — evaluated in recipes,
# after the appimage target has produced the bundles.
BUNDLE_GLOBS = viewer3d/src-tauri/target/release/bundle/appimage/*.AppImage \
               viewer3d/src-tauri/target/release/bundle/deb/*.deb \
               viewer3d/src-tauri/target/release/bundle/rpm/*.rpm

.PHONY: release
release: ## Create a GitHub release with AppImage + deb + rpm (version from tauri.conf.json)
	$(MAKE) appimage
	bash -eu -o pipefail -c 'files=(); for f in $(BUNDLE_GLOBS); do [ -e "$$f" ] && files+=("$$f"); done; [ $${#files[@]} -gt 0 ] || { echo "No bundles found in viewer3d/src-tauri/target/release/bundle/"; exit 1; }; gh release create v$(VERSION) "$${files[@]}" --title "Viewer 3D v$(VERSION)" --generate-notes'

.PHONY: upload
upload: ## Upload AppImage + deb + rpm to an existing GitHub release
	bash -eu -o pipefail -c 'files=(); for f in $(BUNDLE_GLOBS); do [ -e "$$f" ] && files+=("$$f"); done; [ $${#files[@]} -gt 0 ] || { echo "No bundles found in viewer3d/src-tauri/target/release/bundle/"; exit 1; }; gh release upload v$(VERSION) "$${files[@]}" --clobber'
