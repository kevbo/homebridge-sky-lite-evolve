macos-deps:
	brew update
	brew bundle
	@echo "\nMake sure to perform the post-installation tasks for nodenv if you haven't already!\n"

node-deps:
	npm install --include dev

install: macos-deps node-deps

clean:
	rm -rf node_modules

run: node-deps
	npm exec hb-service run

watch: node-deps
	npm run watch

start: node-deps
	sudo npm exec hb-service start

stop: node-deps
	sudo npm exec hb-service stop

dist:
	npm run build

link:
	npm link

publish:
	npm publish

homebridge:
	npm exec homebridge -D

.PHONY: macos-deps node-deps install link homebridge clean start