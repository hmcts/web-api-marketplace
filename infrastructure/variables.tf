variable "product" {
  default = "apim"
}

variable "component" {}

variable "location" {
  default = "UK South"
}

variable "env" {}

variable "subscription" {}

variable "common_tags" {
  type = map(string)
}

variable "team_contact" {
  default = "#api-marketplace-tech"
}

variable "vault_name" {
  description = "Set where the vault is not named product-env. Must match service-api-marketplace, which creates it."
  default     = ""
}

variable "sku_name" {
  default = "Basic"
}

variable "family" {
  default = "C"
}

variable "capacity" {
  default = "1"
}
