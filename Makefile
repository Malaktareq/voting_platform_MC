LAN_PORT ?= 8443
LAN_HTTP_PORT ?= 8080

.DEFAULT_GOAL := lan

.PHONY: help lan lan-443

help:
	@echo "make           Build/start Docker and run the local HTTPS gateway on :$(LAN_PORT)"
	@echo "make lan       Same as make"
	@echo "make lan-443   Build/start Docker and run the gateway on standard HTTPS port 443"
	@echo "Override ports with: make lan LAN_PORT=9443 LAN_HTTP_PORT=8081"

lan:
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required. Install/start Docker, then retry."; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install Node.js 20+ and reopen this terminal."; exit 1; }
	@docker compose version >/dev/null
	@HTTP_PORT=3000 HTTP_BIND=127.0.0.1 REAL_IP_CONF=real-ip.lan.conf docker compose up -d --build
	@LAN_PORT=$(LAN_PORT) LAN_HTTP_PORT=$(LAN_HTTP_PORT) node scripts/lan-gateway.mjs

lan-443:
	@$(MAKE) lan LAN_PORT=443
