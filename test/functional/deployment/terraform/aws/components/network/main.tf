# module purpose: create required deployment networking

variable "region" {
  type = string
}

variable "global_tags" {
  type = map
}

variable "env_prefix" {
  type = string
}

variable "use_availability_zones" {
  type = bool
}

variable "availability_zones" {
  type = map
}

provider "aws" {
  region  =   "${var.region}"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true
  assign_generated_ipv6_cidr_block = true
  tags = "${merge(
    var.global_tags,
    {
      Name = "vpc: Failover-Extension-${var.env_prefix}"
    }
  )}"
}

resource "aws_internet_gateway" "gateway" {
  vpc_id = "${aws_vpc.main.id}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "InternetGateway: Failover Extension-${var.env_prefix}"
    }
  )}"
}

resource "aws_route_table" "mgmt" {
  vpc_id = "${aws_vpc.main.id}"

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${aws_internet_gateway.gateway.id}"
  }

  route {
    ipv6_cidr_block = "::/0"
    gateway_id = "${aws_internet_gateway.gateway.id}"
  }

  tags = "${merge(
    var.global_tags,
    {
      Name = "Mgmt Route Table: Failover Extension-${var.env_prefix}"
    }
  )}"
}

resource "aws_subnet" "mgmtAz1" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.region}${var.availability_zones["primary"]}"
  cidr_block = "10.0.0.0/24"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az1 Mgmt Subnet: Failover Extension-${var.env_prefix}"
    }
  )}"
}

resource "aws_route_table_association" "mgmtAz1" {
  subnet_id      = "${aws_subnet.mgmtAz1.id}"
  route_table_id = "${aws_route_table.mgmt.id}"
}

resource "aws_subnet" "mgmtAz2" {
  count = "${var.use_availability_zones ? 1 : 0}"

  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.region}${var.availability_zones["secondary"]}"
  cidr_block = "10.0.10.0/24"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az2 Mgmt Subnet: Failover Extension-${var.env_prefix}"
    }
  )}"
}

resource "aws_route_table_association" "mgmtAz2" {
  count = "${var.use_availability_zones ? 1 : 0}"

  subnet_id      = "${aws_subnet.mgmtAz2[0].id}"
  route_table_id = "${aws_route_table.mgmt.id}"
}

resource "aws_subnet" "externalAz1" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.region}${var.availability_zones["primary"]}"
  cidr_block = "10.0.1.0/24"

  ipv6_cidr_block = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 3)
  assign_ipv6_address_on_creation = true

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az1 External Subnet: Failover Extension-${var.env_prefix}"
    }
  )}"
}

resource "aws_subnet" "externalAz2" {
  count = "${var.use_availability_zones ? 1 : 0}"

  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.region}${var.availability_zones["secondary"]}"
  cidr_block = "10.0.11.0/24"

  ipv6_cidr_block = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 4)
  assign_ipv6_address_on_creation = true

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az2 External Subnet: Failover Extension-${var.env_prefix}"
    }
  )}"
}

output "network_id" {
  value = "${aws_vpc.main.id}"
}

output "internet_gateway_id" {
  value = "${aws_internet_gateway.gateway.id}"
}

output "mgmt_subnet_1_id" {
  value = aws_subnet.mgmtAz1.id
}

output "mgmt_subnet_2_id" {
  value = (var.use_availability_zones ? aws_subnet.mgmtAz2[0].id : aws_subnet.mgmtAz1.id)
}

output "ext_subnet_1_id" {
  value = aws_subnet.externalAz1.id
}

output "ext_subnet_2_id" {
  value = (var.use_availability_zones ? aws_subnet.externalAz2[0].id : aws_subnet.externalAz1.id)
}

output "ext_subnet_1_cidr_block" {
  value = aws_subnet.externalAz1.cidr_block
}

output "ext_subnet_2_cidr_block" {
  value = (var.use_availability_zones ? aws_subnet.externalAz2[0].cidr_block : aws_subnet.externalAz1.cidr_block)
}

