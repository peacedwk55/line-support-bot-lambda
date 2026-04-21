variable "app_name" {
  description = "Application name"
  type        = string
  default     = "demo-iac"
}

variable "app_image" {
  description = "Docker image for the web app"
  type        = string
  default     = "nginx:alpine"
}

variable "app_port" {
  description = "External port exposed for the web app"
  type        = number
  default     = 8080
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "demodb"
}

variable "db_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "demouser"
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  default     = "demopass"
  sensitive   = true
}
