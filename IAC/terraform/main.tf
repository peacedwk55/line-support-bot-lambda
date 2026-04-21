terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

# Network
resource "docker_network" "app_network" {
  name = "${var.app_name}-network"
}

# Volumes
resource "docker_volume" "db_data" {
  name = "${var.app_name}-db-data"
}

resource "docker_volume" "app_html" {
  name = "${var.app_name}-html"
}

# Pull images
resource "docker_image" "app" {
  name         = var.app_image
  keep_locally = true
}

resource "docker_image" "db" {
  name         = "postgres:15-alpine"
  keep_locally = true
}

# Web app container
resource "docker_container" "app" {
  name  = "${var.app_name}-web"
  image = docker_image.app.image_id

  ports {
    internal = 80
    external = var.app_port
  }

  networks_advanced {
    name = docker_network.app_network.name
  }

  volumes {
    volume_name    = docker_volume.app_html.name
    container_path = "/usr/share/nginx/html"
  }

  restart = "unless-stopped"
}

# Database container
resource "docker_container" "db" {
  name  = "${var.app_name}-db"
  image = docker_image.db.image_id

  env = [
    "POSTGRES_DB=${var.db_name}",
    "POSTGRES_USER=${var.db_user}",
    "POSTGRES_PASSWORD=${var.db_password}",
  ]

  networks_advanced {
    name = docker_network.app_network.name
  }

  volumes {
    volume_name    = docker_volume.db_data.name
    container_path = "/var/lib/postgresql/data"
  }

  restart = "unless-stopped"
}
