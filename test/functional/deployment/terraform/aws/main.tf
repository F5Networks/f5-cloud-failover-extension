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
  region  =   "${var.aws_region}"
}

# Create 'supporting' network infrastructure for the BIG-IP VMs (aka: what is done in the AWS 'VPC' CFTs)
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = {
    Name = "vpc: Failover-Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_internet_gateway" "gateway" {
  vpc_id = "${aws_vpc.main.id}"
  
  tags = {
    Name = "InternetGateway: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table" "mgmt" {
  vpc_id = "${aws_vpc.main.id}"

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${aws_internet_gateway.gateway.id}"
  }

  tags = {
    Name = "Mgmt Route Table: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table" "external" {
  vpc_id = "${aws_vpc.main.id}"

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${aws_internet_gateway.gateway.id}"
  }

  tags = {
    Name = "External Route Table: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_subnet" "mgmtAz1" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}a"
  cidr_block = "10.0.0.0/24"

  tags = {
    Name = "Az1 Mgmt Subnet: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table_association" "mgmtAz1" {
  subnet_id      = "${aws_subnet.mgmtAz1.id}"
  route_table_id = "${aws_route_table.mgmt.id}"
}

resource "aws_subnet" "mgmtAz2" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}b"
  cidr_block = "10.0.10.0/24"

  tags = {
    Name = "Az2 Mgmt Subnet: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table_association" "mgmtAz2" {
  subnet_id      = "${aws_subnet.mgmtAz2.id}"
  route_table_id = "${aws_route_table.mgmt.id}"
}

resource "aws_subnet" "externalAz1" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}a"
  cidr_block = "10.0.1.0/24"

  tags = {
    Name = "Az1 External Subnet: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table_association" "externalAz1" {
  subnet_id      = "${aws_subnet.externalAz1.id}"
  route_table_id = "${aws_route_table.external.id}"
}

resource "aws_subnet" "externalAz2" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}b"
  cidr_block = "10.0.11.0/24"

  tags = {
    Name = "Az1 External Subnet: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_route_table_association" "externalAz2" {
  subnet_id      = "${aws_subnet.externalAz2.id}"
  route_table_id = "${aws_route_table.external.id}"
}

# Create the BIG-IPs used for Failover testing
resource "aws_security_group" "external" {
  description = "External interface rules"
  vpc_id = "${aws_vpc.main.id}"

  ingress {
    from_port = 80
    to_port = 80
    protocol = 6
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 443
    to_port = 443
    protocol = 6
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 4353
    to_port = 4353
    protocol = 6
    self = true
  }

  ingress {
    from_port = 1026
    to_port = 1026
    protocol = 17
    self = true
  }

  tags = {
    Name = "External Security Group: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_security_group" "mgmt" {
  description = "External interface rules"
  vpc_id = "${aws_vpc.main.id}"

  ingress {
    from_port = 22
    to_port = 22
    protocol = 6
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 443
    to_port = 443
    protocol = 6
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 443
    to_port = 443
    protocol = 6
    security_groups = ["${aws_security_group.external.id}"]
  }

  tags = {
    Name = "Mgmt Security Group: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}