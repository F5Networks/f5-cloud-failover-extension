resource "random_string" "admin_password" {
  length            = 16
  min_upper         = 1
  min_lower         = 1
  min_numeric       = 1
  special           = false
}

resource "random_string" "env_prefix" {
  length = 8
  upper = false
  special = false
}

provider "aws" {
  region  =   var.aws_region
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = {
    Name = "vpc: Failover-Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_internet_gateway" "mgmtIpGateway" {
  vpc_id = aws_vpc.main.id
  
  tags = {
    Name = "InternetGateway: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}


resource "aws_subnet" "mgmtAz1" {
  vpc_id = aws_vpc.main.id
  availability_zone = "${var.aws_region}a"
  cidr_block = "10.0.0.0/24"

  tags = {
    Name = "Az1 Mgmt Subnet: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table" "mgmt" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${aws_internet_gateway.mgmtIpGateway.id}"
  }

  tags = {
    Name = "Mgmt Route Table: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table_association" "mgmtAz1" {
  subnet_id      = "${aws_subnet.mgmtAz1.id}"
  route_table_id = "${aws_route_table.mgmt.id}"
}
