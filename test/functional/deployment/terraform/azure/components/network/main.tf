# module purpose: create required deployment networking

variable "env_prefix" {
  type = string
}

variable "location" {
  type = string
}

variable "nic_count" {
  type = number
}

resource "azurerm_resource_group" "deployment" {
  name      = "${var.env_prefix}"
  location  = "${var.location}"
  tags = {
    creator = "Terraform"
    delete  = "True"
  }
}

resource "azurerm_virtual_network" "deployment" {
  name                = "${var.env_prefix}-network"
  address_space       = ["10.0.0.0/16"]
  location            = "${azurerm_resource_group.deployment.location}"
  resource_group_name = "${azurerm_resource_group.deployment.name}"
}

resource "azurerm_subnet" "mgmt" {
  name                 = "mgmt"
  resource_group_name  = "${azurerm_resource_group.deployment.name}"
  virtual_network_name = "${azurerm_virtual_network.deployment.name}"
  address_prefix       = "10.0.0.0/24"
}

resource "azurerm_subnet" "internal" {
  count = "${var.nic_count == 1 ? 0 : 1}"
  name                 = "internal"
  resource_group_name  = "${azurerm_resource_group.deployment.name}"
  virtual_network_name = "${azurerm_virtual_network.deployment.name}"
  address_prefix       = "10.0.1.0/24"
}

resource "azurerm_subnet" "external" {
  count = "${var.nic_count == 1 ? 0 : 1}"
  name                 = "external"
  resource_group_name  = "${azurerm_resource_group.deployment.name}"
  virtual_network_name = "${azurerm_virtual_network.deployment.name}"
  address_prefix       = "10.0.2.0/24"
}

output "resource_group_name" {
  value = "${azurerm_resource_group.deployment.name}"
}

output "location" {
  value = "${azurerm_resource_group.deployment.location}"
}

output "mgmt_subnet" {
  value = "${azurerm_subnet.mgmt}"
}

output "internal_subnet" {
  value = "${azurerm_subnet.internal}"
}

output "external_subnet" {
  value = "${azurerm_subnet.external}"
}