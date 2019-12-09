

variable "aws_region" {
  description = "The AWS Region in which the resources in this example should exist"
  default     = "us-west-2"
}

variable "aws_bigip_ami_id" {
  default = "ami-0659b06e79b146b53"
}

variable "offer" {
  default = "f5-big-ip-good"
}

variable "sku" {
  default = "f5-bigip-virtual-edition-25m-good-hourly"
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
  default     = "awsuser"
}

variable "instance_key_name" {
  description = "Specify the name of the pre-loaded instance SSH key to use"
  default     = "dewpt"
}

variable "use_availability_zones" {
  description = "Specify if multiple availability zones should be used"
  default     = true
  type        = bool
}
