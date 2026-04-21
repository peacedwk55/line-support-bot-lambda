# Demo IAC

Demo project แสดงการใช้ Terraform + Docker + Ansible ร่วมกัน

## Stack

| Tool | หน้าที่ |
|---|---|
| **Terraform** | Provision Docker network, containers, volumes |
| **Docker** | รัน nginx (web) + PostgreSQL (db) |
| **Ansible** | Configure และ deploy application |

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- [Docker](https://docs.docker.com/get-docker/) (running)
- [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/) >= 2.14

## Quick Start

```bash
# 1. Init Terraform providers
make init

# 2. Preview what will be created
make plan

# 3. Provision + Configure + Deploy ทีเดียว
make all
```

App จะขึ้นที่ http://localhost:8080

## Commands

```bash
make init       # Init Terraform providers
make plan       # Preview infrastructure changes
make apply      # Provision containers
make configure  # Run Ansible setup
make deploy     # Deploy app via Ansible
make all        # apply + configure + deploy
make destroy    # Tear down everything
make clean      # destroy + remove docker volumes
```

## Project Structure

```
Demo-IAC/
├── Makefile
├── terraform/
│   ├── main.tf          # Docker provider, containers, network
│   ├── variables.tf
│   └── outputs.tf
├── docker/
│   ├── app/
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   └── html/index.html
│   └── docker-compose.yml
└── ansible/
    ├── inventory/hosts.ini
    ├── group_vars/all.yml
    └── playbooks/
        ├── site.yml     # Main entry point
        ├── setup.yml    # Verify containers ready
        └── deploy.yml   # Deploy files + health check
```

## Flow

```
make all
  └── terraform apply   → สร้าง Docker network + containers
  └── ansible setup     → ตรวจสอบ container พร้อมใช้งาน
  └── ansible deploy    → Copy files + reload nginx + health check
```
