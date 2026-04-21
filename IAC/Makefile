.PHONY: help init plan apply destroy configure deploy all clean

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  init        Init Terraform providers"
	@echo "  plan        Preview infrastructure changes"
	@echo "  apply       Provision containers with Terraform"
	@echo "  destroy     Destroy all provisioned containers"
	@echo "  configure   Run Ansible setup playbook"
	@echo "  deploy      Run Ansible deploy playbook"
	@echo "  all         apply + configure + deploy"
	@echo "  clean       destroy + remove docker volumes"

init:
	cd terraform && terraform init

plan:
	cd terraform && terraform plan

apply:
	cd terraform && terraform apply -auto-approve

destroy:
	cd terraform && terraform destroy -auto-approve

configure:
	ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/setup.yml

deploy:
	ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/deploy.yml

all: apply configure deploy
	@echo "Done! App running at http://localhost:8080"

clean: destroy
	docker volume prune -f
