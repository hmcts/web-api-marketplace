provider "azurerm" {
  features {}
}

locals {
  tags = merge(
    var.common_tags,
    tomap({ "Team Contact" = var.team_contact })
  )

  vault_name           = var.vault_name != "" ? var.vault_name : "${var.product}-${var.env}"
  vault_resource_group = "${var.product}-shared-${var.env}"
}

module "redis_cache" {
  source                        = "git@github.com:hmcts/cnp-module-redis?ref=master"
  product                       = "${var.product}-${var.component}-redis-cache"
  location                      = var.location
  env                           = var.env
  common_tags                   = local.tags
  business_area                 = "cft"
  redis_version                 = "6"
  private_endpoint_enabled      = true
  public_network_access_enabled = false
  sku_name                      = var.sku_name
  family                        = var.family
  capacity                      = var.capacity
}

data "azurerm_key_vault" "vault" {
  name                = local.vault_name
  resource_group_name = local.vault_resource_group
}

resource "azurerm_key_vault_secret" "redis_host" {
  name         = "${var.component}-redis-host"
  value        = module.redis_cache.host_name
  key_vault_id = data.azurerm_key_vault.vault.id
}

resource "azurerm_key_vault_secret" "redis_port" {
  name         = "${var.component}-redis-port"
  value        = module.redis_cache.redis_port
  key_vault_id = data.azurerm_key_vault.vault.id
}

resource "azurerm_key_vault_secret" "redis_access_key" {
  name         = "${var.component}-redis-access-key"
  value        = module.redis_cache.access_key
  key_vault_id = data.azurerm_key_vault.vault.id
}

resource "random_string" "session_secret" {
  length  = 64
  special = false
}

resource "azurerm_key_vault_secret" "session_secret" {
  name         = "${var.component}-session-secret"
  value        = random_string.session_secret.result
  key_vault_id = data.azurerm_key_vault.vault.id

  lifecycle {
    ignore_changes = [value]
  }
}
