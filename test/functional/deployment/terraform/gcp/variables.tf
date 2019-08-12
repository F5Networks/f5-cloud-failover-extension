variable "region" {
  description = "The GCP Region in which the resources in this example should exist"
  default     = "us-west1"
}

variable "zone" {
  description = "The GCP Zone in which the resources in this example should exist"
  default     = "us-west1-a"
}

variable "publisher" {
  default = "f5-networks"
}

variable "projectId" {
  default = "***REMOVED***"
  description = "GCP project where resources will be created"
}

variable "imageProjectId" {
  default = "f5-7626-networks-public"
  description = "GCP project where resources will be created"
}

variable "int-subnet-cidr-range" {
  default = "10.0.2.0/24"
}

variable "ext-subnet-cidr-range" {
  default = "10.0.3.0/24"
}

variable "mgmt-subnet-cidr-range" {
  default = "10.0.1.0/24"
}

variable "int-subnet-getway" {
  default = "10.0.2.1"
}

variable "ext-subnet-getway" {
  default = "10.0.3.1"
}

variable "mgmt-subnet-getway" {
  default = "10.0.1.1"
}


variable "vm01-mgmt-private-ip" {
  default = "10.0.1.2"
}

variable "vm01-int-private-ip" {
  default = "10.0.2.2"
}

variable "vm01-ext-private-ip" {
  default = "10.0.3.2"
}


variable "vm02-mgmt-private-ip" {
  default = "10.0.1.3"
}

variable "vm02-int-private-ip" {
  default = "10.0.2.3"
}

variable "vm02-ext-private-ip" {
  default = "10.0.3.3"
}


variable "vm_instance01_name" {
  default = "tf-func-test-failover-01"
}

variable "vm_instance02_name" {
  default = "tf-func-test-failover-02"
}

variable "offer" {
  default = "f5-big-ip-good"
}

variable "sku" {
  default = "https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/images/f5-bigip-14-0-0-5-0-0-141-payg-best-5gbps-20190722071403"
}

variable "bigip_version" {
  description = "The BIG-IP version for the virtual machine"
  default     = "latest"
}

variable "instance_size" {
  description = "The instance size for the virtual machine"
  default     = "Standard_DS3_v2"
}

variable "admin_username" {
  description = "The admin username for the virtual machine"
  default     = "azureuser"
}
