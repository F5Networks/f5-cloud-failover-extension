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
    Name = "Az2 External Subnet: Failover Extension-${random_string.env_prefix.result}"
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

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
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

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "Mgmt Security Group: Failover Extension-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_s3_bucket" "configdb" {
  bucket = "failoverextension-${random_string.env_prefix.result}-s3bucket"
  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "failoverextension-${random_string.env_prefix.result}-s3bucket"
  }
}

resource "aws_iam_role" "main" {
  name = "Failover-Extension-IAM-role-${random_string.env_prefix.result}"
  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF
  tags = {
    Name = "Failover Extension IAM role-${random_string.env_prefix.result}"
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

resource "aws_iam_role_policy" "BigIpPolicy" {
  name = "BigIpPolicy"
  role = "${aws_iam_role.main.id}"

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
        "Action": [
            "ec2:DescribeInstances",
            "ec2:DescribeInstanceStatus",
            "ec2:DescribeAddresses",
            "ec2:AssociateAddress",
            "ec2:DisassociateAddress",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DescribeNetworkInterfaceAttribute",
            "ec2:DescribeRouteTables",
            "ec2:ReplaceRoute",
            "ec2:assignprivateipaddresses",
            "sts:AssumeRole"
        ],
        "Resource": [
            "*"
        ],
        "Effect": "Allow"
    },
    {
        "Action": [
            "s3:ListBucket"
        ],
        "Resource": "arn:*:s3:::${aws_s3_bucket.configdb.id}",
        "Effect": "Allow"
    },
    {
        "Action": [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject"
        ],
        "Resource": "arn:*:s3:::${aws_s3_bucket.configdb.id}/*",
        "Effect": "Allow"
    }
  ]
}
EOF
}

resource "aws_iam_instance_profile" "instance_profile" {
  name = "Failover-Extension-IAM-role-${random_string.env_prefix.result}"
  role = "${aws_iam_role.main.id}"
}

resource "aws_network_interface" "mgmt1" {
  subnet_id = "${aws_subnet.mgmtAz1.id}"
  security_groups = ["${aws_security_group.mgmt.id}"]
  description = "Management Interface for BIG-IP"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "Mgmt Network Interface Az1: Failover Extension-${random_string.env_prefix.result}"
  }
}

resource "aws_eip" "mgmt1" {
  vpc = true
  network_interface = "${aws_network_interface.mgmt1.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.mgmt1.private_ips)[0]}"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "ElasticIP Mgmt Az1: Failover Extension-${random_string.env_prefix.result}"
  }
}


resource "aws_network_interface" "mgmt2" {
  subnet_id = "${aws_subnet.mgmtAz2.id}"
  security_groups = ["${aws_security_group.mgmt.id}"]
  description = "Management Interface for BIG-IP"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "Mgmt Network Interface Az2: Failover Extension-${random_string.env_prefix.result}"
  }
}

resource "aws_eip" "mgmt2" {
  vpc = true
  network_interface = "${aws_network_interface.mgmt2.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.mgmt2.private_ips)[0]}"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "ElasticIP Mgmt Az2: Failover Extension-${random_string.env_prefix.result}"
  }
}

resource "aws_network_interface" "external1" {
  subnet_id = "${aws_subnet.externalAz1.id}"
  security_groups = ["${aws_security_group.external.id}"]
  description = "Public External Interface for the BIG-IP"

  private_ips_count = 1

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "External Network Interface Az1: Failover Extension-${random_string.env_prefix.result}"
  }
}

resource "aws_eip" "external1" {
  vpc = true
  network_interface = "${aws_network_interface.external1.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.external1.private_ips)[0]}"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "ElasticIP External Az1: Failover Extension-${random_string.env_prefix.result}"
  }
}

resource "aws_network_interface" "external2" {
  subnet_id = "${aws_subnet.externalAz2.id}"
  security_groups = ["${aws_security_group.external.id}"]
  description = "Public External Interface for the BIG-IP"

  private_ips_count = 1

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "External Network Interface Az2: Failover Extension-${random_string.env_prefix.result}"
  }
}

resource "aws_eip" "external2" {
  vpc = true
  network_interface = "${aws_network_interface.external2.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.external2.private_ips)[0]}"
  
  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "ElasticIP External Az2: Failover Extension-${random_string.env_prefix.result}"
  }
}

resource "aws_eip" "vip1" {
  vpc = true
  network_interface = "${aws_network_interface.external2.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.external2.private_ips)[1]}"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "ElasticIP VIP: Failover Extension-${random_string.env_prefix.result}"
    F5_CLOUD_FAILOVER_LABEL = "deployment-${random_string.env_prefix.result}"
    VIPS = "${tolist(aws_network_interface.external1.private_ips)[1]},${tolist(aws_network_interface.external2.private_ips)[1]}"
  }
}

data "template_file" "user_data_vm0" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username        = "${var.admin_username}"
    admin_password        = "${random_string.admin_password.result}"
  }
}

data "template_file" "user_data_vm1" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username        = "${var.admin_username}"
    admin_password        = "${random_string.admin_password.result}"
  }
}

resource "aws_instance" "vm0" {
  ami = "${var.aws_bigip_ami_id}"
  instance_type = "m5.xlarge"
  availability_zone = "${var.aws_region}a"
  key_name = "dewpt"

  network_interface {
    network_interface_id = "${aws_network_interface.mgmt1.id}"
    device_index = 0
  }

  network_interface {
    network_interface_id = "${aws_network_interface.external1.id}"
    device_index = 1
  }

  iam_instance_profile = "${aws_iam_instance_profile.instance_profile.name}"

  user_data = "${data.template_file.user_data_vm0.rendered}"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "BigIp 1: Failover Extension-${random_string.env_prefix.result}"
  }

  # Wait until the instance is in a running state
  provisioner "local-exec" {
    command = "aws ec2 wait instance-status-ok --instance-ids ${aws_instance.vm0.id} --region ${var.aws_region}"
  } 
}

resource "aws_instance" "vm1" {
  ami = "${var.aws_bigip_ami_id}"
  instance_type = "m5.xlarge"
  availability_zone = "${var.aws_region}b"
  key_name = "dewpt"

  network_interface {
    network_interface_id = "${aws_network_interface.mgmt2.id}"
    device_index = 0
  }

  network_interface {
    network_interface_id = "${aws_network_interface.external2.id}"
    device_index = 1
  }

  iam_instance_profile = "${aws_iam_instance_profile.instance_profile.name}"

  user_data = "${data.template_file.user_data_vm1.rendered}"

  tags = {
    creator = "Terraform - Failover Extension"
    delete = "True"
    Name = "BigIp 2: Failover Extension-${random_string.env_prefix.result}"
  }

  # Wait until the instance is in a running state
  provisioner "local-exec" {
    command = "aws ec2 wait instance-status-ok --instance-ids ${aws_instance.vm1.id} --region ${var.aws_region}"
  } 
}

resource "local_file" "do0" {
    content  = templatefile("${path.module}/../../declarations/do_onboard_aws.json", { 
      hostname = "failover0.local",
      admin_password = "${random_string.admin_password.result}",
      external_self = "${aws_network_interface.external1.private_ip}/24",
      remoteHost = "${aws_network_interface.mgmt1.private_ip}"
    })
    filename = "${path.module}/temp_onboard_do0.json"
}

resource "local_file" "do1" {
    content  = templatefile("${path.module}/../../declarations/do_onboard_aws.json", {
      hostname = "failover1.local",
      admin_password = "${random_string.admin_password.result}",
      external_self = "${aws_network_interface.external2.private_ip}/24",
      remoteHost = "${aws_network_interface.mgmt1.private_ip}"
    })
    filename = "${path.module}/temp_onboard_do1.json"
}

resource "null_resource" "login0" {
  provisioner "local-exec" {
    command = "f5 bigip login --host ${aws_eip.mgmt1.public_ip} --user ${var.admin_username} --password ${random_string.admin_password.result}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_onboard_aws.json")
  }
  depends_on = [aws_instance.vm0]
}

resource "null_resource" "failover0" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component failover --declaration ${path.module}/../../declarations/failover_aws.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/failover_aws.json")
  }
  depends_on = [null_resource.login0]
}

resource "null_resource" "onboard0" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_onboard_do0.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_onboard_aws.json")
  }
  depends_on = [local_file.do0, null_resource.failover0]
}

resource "null_resource" "login1" {
  provisioner "local-exec" {
    command = "f5 bigip login --host ${aws_eip.mgmt2.public_ip} --user ${var.admin_username} --password ${random_string.admin_password.result}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_onboard_aws.json")
  }
  depends_on = [aws_instance.vm1, null_resource.onboard0]
}

resource "null_resource" "failover1" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component failover --declaration ${path.module}/../../declarations/failover_aws.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/failover_aws.json")
  }
  depends_on = [null_resource.login1]
}

resource "null_resource" "onboard1" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_onboard_do1.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_onboard_aws.json")
  }
  depends_on = [local_file.do1, null_resource.failover1]
}

# Outputs
output "public_ip_address_vm0" {
  value = "${aws_eip.mgmt1.public_ip}"
}

output "public_ip_address_vm1" {
  value = "${aws_eip.mgmt2.public_ip}"
}

output "public_vip_address" {
  value = "${aws_eip.vip1.public_ip}"
}

output "admin_password" {
  value = random_string.admin_password.result
}