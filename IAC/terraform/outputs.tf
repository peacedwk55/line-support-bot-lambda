output "app_url" {
  description = "URL to access the web application"
  value       = "http://localhost:${var.app_port}"
}

output "network_name" {
  description = "Docker network name"
  value       = docker_network.app_network.name
}

output "app_container_id" {
  description = "Web app container ID"
  value       = docker_container.app.id
}

output "db_container_id" {
  description = "Database container ID"
  value       = docker_container.db.id
}
