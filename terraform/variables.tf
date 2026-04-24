variable "region" {
  default = "ap-southeast-1"
}

variable "app_name" {
  default = "line-support-bot"
}

variable "groq_api_key" {
  description = "Groq API Key"
  type        = string
  sensitive   = true
}

variable "line_channel_access_token" {
  description = "LINE Channel Access Token"
  type        = string
  sensitive   = true
}

variable "line_channel_secret" {
  description = "LINE Channel Secret (สำหรับ verify webhook signature)"
  type        = string
  sensitive   = true
}

variable "upstash_vector_rest_url" {
  description = "Upstash Vector REST URL"
  type        = string
}

variable "upstash_vector_rest_token" {
  description = "Upstash Vector REST Token"
  type        = string
  sensitive   = true
}
