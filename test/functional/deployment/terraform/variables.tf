variable "env_prefix" {
  description = "The Prefix used for all resources in this example"
}

variable "location" {
  description = "The Azure Region in which the resources in this example should exist"
  default = "westus"
}

variable "publisher" {
  default = "f5-networks"
}

variable "offer" {
  default = "f5-big-ip-good"
}

variable "sku" {
  default = "f5-bigip-virtual-edition-25m-good-hourly"
}

variable "admin_username" {
  description = "The admin username for the virtual machine"
  default = "azureuser"
}

variable "admin_password" {
  description = "The admin password for the virtual machine"
}