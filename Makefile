.PHONY: help install build deploy destroy

help:
	@echo "  install   Install dependencies"
	@echo "  build     Package Lambda zip"
	@echo "  init      Init Terraform"
	@echo "  plan      Preview infrastructure"
	@echo "  deploy    Build + Terraform apply"
	@echo "  destroy   Destroy all resources"

install:
	npm install

build: install
	zip -r deploy.zip src/ node_modules/ package.json

init:
	cd terraform && terraform init

plan: build
	cd terraform && terraform plan \
		-var="groq_api_key=$(GROQ_API_KEY)" \
		-var="line_channel_access_token=$(LINE_CHANNEL_ACCESS_TOKEN)" \
		-var="line_channel_secret=$(LINE_CHANNEL_SECRET)" \
		-var="upstash_vector_rest_url=$(UPSTASH_VECTOR_REST_URL)" \
		-var="upstash_vector_rest_token=$(UPSTASH_VECTOR_REST_TOKEN)"

deploy: build
	cd terraform && terraform apply -auto-approve \
		-var="groq_api_key=$(GROQ_API_KEY)" \
		-var="line_channel_access_token=$(LINE_CHANNEL_ACCESS_TOKEN)" \
		-var="line_channel_secret=$(LINE_CHANNEL_SECRET)" \
		-var="upstash_vector_rest_url=$(UPSTASH_VECTOR_REST_URL)" \
		-var="upstash_vector_rest_token=$(UPSTASH_VECTOR_REST_TOKEN)"
	@echo ""
	@echo "Webhook URL (ใส่ใน LINE Developers Console):"
	@cd terraform && terraform output webhook_url

destroy:
	cd terraform && terraform destroy -auto-approve \
		-var="groq_api_key=$(GROQ_API_KEY)" \
		-var="line_channel_access_token=$(LINE_CHANNEL_ACCESS_TOKEN)" \
		-var="line_channel_secret=$(LINE_CHANNEL_SECRET)" \
		-var="upstash_vector_rest_url=$(UPSTASH_VECTOR_REST_URL)" \
		-var="upstash_vector_rest_token=$(UPSTASH_VECTOR_REST_TOKEN)"
