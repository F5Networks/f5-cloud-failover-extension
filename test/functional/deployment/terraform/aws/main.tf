module "utils" {
  source = "../utils"
}

provider "aws" {
  region  =   "${var.aws_region}"
}

variable "global_tags" {
  type = "map"
  default = {
    creator = "Terraform - Failover Extension"
    delete = "True"
  }
}

# Create 'supporting' network infrastructure for the BIG-IP VMs (aka: what is done in the AWS 'VPC' CFTs)
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = "${merge(
    var.global_tags,
    {
      Name = "vpc: Failover-Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_internet_gateway" "gateway" {
  vpc_id = "${aws_vpc.main.id}"
  
  tags = "${merge(
    var.global_tags,
    {
      Name = "InternetGateway: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_route_table" "mgmt" {
  vpc_id = "${aws_vpc.main.id}"

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${aws_internet_gateway.gateway.id}"
  }

  tags = "${merge(
    var.global_tags,
    {
      Name = "Mgmt Route Table: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_route_table" "external" {
  vpc_id = "${aws_vpc.main.id}"

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${aws_internet_gateway.gateway.id}"
  }

  tags = "${merge(
    var.global_tags,
    {
      Name = "External Route Table: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_subnet" "mgmtAz1" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}a"
  cidr_block = "10.0.0.0/24"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az1 Mgmt Subnet: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_route_table_association" "mgmtAz1" {
  subnet_id      = "${aws_subnet.mgmtAz1.id}"
  route_table_id = "${aws_route_table.mgmt.id}"
}

resource "aws_subnet" "mgmtAz2" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}b"
  cidr_block = "10.0.10.0/24"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az2 Mgmt Subnet: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_route_table_association" "mgmtAz2" {
  subnet_id      = "${aws_subnet.mgmtAz2.id}"
  route_table_id = "${aws_route_table.mgmt.id}"
}

resource "aws_subnet" "externalAz1" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}a"
  cidr_block = "10.0.1.0/24"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az1 External Subnet: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_route_table_association" "externalAz1" {
  subnet_id      = "${aws_subnet.externalAz1.id}"
  route_table_id = "${aws_route_table.external.id}"
}

resource "aws_subnet" "externalAz2" {
  vpc_id = "${aws_vpc.main.id}"
  availability_zone = "${var.aws_region}b"
  cidr_block = "10.0.11.0/24"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Az2 External Subnet: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
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

  tags = "${merge(
    var.global_tags,
    {
      Name = "External Security Group: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
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

  tags = "${merge(
    var.global_tags,
    {
      Name = "Mgmt Security Group: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_s3_bucket" "configdb" {
  bucket = "failoverextension-${module.utils.env_prefix}-s3bucket"

  force_destroy = true

  tags = "${merge(
    var.global_tags,
    {
      Name = "failoverextension-${module.utils.env_prefix}-s3bucket"
    }
  )}"
}

resource "aws_iam_role" "main" {
  name = "Failover-Extension-IAM-role-${module.utils.env_prefix}"
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
  tags = "${merge(
    var.global_tags,
    {
      Name = "Failover Extension IAM role-${module.utils.env_prefix}"
    }
  )}"
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
            "sts:AssumeRole",
            "s3:ListAllMyBuckets"
        ],
        "Resource": [
            "*"
        ],
        "Effect": "Allow"
    },
    {
        "Action": [
            "s3:ListBucket",
            "s3:GetBucketTagging"
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
  name = "Failover-Extension-IAM-role-${module.utils.env_prefix}"
  role = "${aws_iam_role.main.id}"
}

resource "aws_network_interface" "mgmt1" {
  subnet_id = "${aws_subnet.mgmtAz1.id}"
  security_groups = ["${aws_security_group.mgmt.id}"]
  description = "Management Interface for BIG-IP"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Mgmt Network Interface Az1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "mgmt1" {
  vpc = true
  network_interface = "${aws_network_interface.mgmt1.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.mgmt1.private_ips)[0]}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP Mgmt Az1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_network_interface" "mgmt2" {
  subnet_id = "${aws_subnet.mgmtAz2.id}"
  security_groups = ["${aws_security_group.mgmt.id}"]
  description = "Management Interface for BIG-IP"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Mgmt Network Interface Az2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "mgmt2" {
  vpc = true
  network_interface = "${aws_network_interface.mgmt2.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.mgmt2.private_ips)[0]}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP Mgmt Az2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_network_interface" "external1" {
  subnet_id = "${aws_subnet.externalAz1.id}"
  security_groups = ["${aws_security_group.external.id}"]
  description = "Public External Interface for the BIG-IP"

  private_ips_count = 1

  tags = "${merge(
    var.global_tags,
    {
      Name = "External Network Interface Az1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "external1" {
  vpc = true
  network_interface = "${aws_network_interface.external1.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.external1.private_ips)[0]}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP External Az1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_network_interface" "external2" {
  subnet_id = "${aws_subnet.externalAz2.id}"
  security_groups = ["${aws_security_group.external.id}"]
  description = "Public External Interface for the BIG-IP"

  private_ips_count = 1

  tags = "${merge(
    var.global_tags,
    {
      Name = "External Network Interface Az2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "external2" {
  vpc = true
  network_interface = "${aws_network_interface.external2.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.external2.private_ips)[0]}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP External Az2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "vip1" {
  vpc = true
  network_interface = "${aws_network_interface.external2.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.external2.private_ips)[1]}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP VIP: Failover Extension-${module.utils.env_prefix}",
      F5_CLOUD_FAILOVER_LABEL = "deployment-functional-testing",
      VIPS = "${tolist(aws_network_interface.external1.private_ips)[0]},${tolist(aws_network_interface.external2.private_ips)[0]}"
    }
  )}"
}

data "template_file" "user_data_vm0" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username  = "${var.admin_username}"
    admin_password  = "${module.utils.admin_password}"
    external_self   = "${aws_network_interface.external1.private_ip}/24"
    default_gw      = "10.0.1.1"
  }
}

data "template_file" "user_data_vm1" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username = "${var.admin_username}"
    admin_password = "${module.utils.admin_password}"
    external_self  = "${aws_network_interface.external2.private_ip}/24"
    default_gw      = "10.0.11.1"
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

  tags = "${merge(
    var.global_tags,
    {
      Name = "BigIp 1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"

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

  tags = "${merge(
    var.global_tags,
    {
      Name = "BigIp 2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"

  # Wait until the instance is in a running state
  provisioner "local-exec" {
    command = "aws ec2 wait instance-status-ok --instance-ids ${aws_instance.vm1.id} --region ${var.aws_region}"
  } 
}

resource "local_file" "do0" {
    content = "${templatefile(
      "${path.module}/../../declarations/do/aws_do_template.json",
      {
        hostname = "failover0.local",
        admin_username = "${var.admin_username}",
        admin_password = "${module.utils.admin_password}",
        external_self = "${aws_network_interface.external1.private_ip}",
        remote_host = "${aws_network_interface.mgmt1.private_ip}"
      }
    )}"
    filename = "${path.module}/temp_do0.json"
}

resource "local_file" "do1" {
    content = "${templatefile(
      "${path.module}/../../declarations/do/aws_do_template.json",
      {
        hostname = "failover1.local",
        admin_username = "${var.admin_username}",
        admin_password = "${module.utils.admin_password}",
        external_self = "${aws_network_interface.external2.private_ip}",
        remote_host = "${aws_network_interface.mgmt1.private_ip}"
      }
    )}"
    filename = "${path.module}/temp_do1.json"
}

resource "null_resource" "login0" {
  provisioner "local-exec" {
    command = "f5 bigip configure-auth --host ${aws_eip.mgmt1.public_ip} --user ${var.admin_username} --password ${module.utils.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/aws_do_template.json")
  }
  depends_on = [aws_instance.vm0]
}

resource "null_resource" "onboard0" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_do0.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/aws_do_template.json")
  }
  depends_on = [local_file.do0, null_resource.login0]
}

resource "null_resource" "login1" {
  provisioner "local-exec" {
    command = "f5 bigip configure-auth --host ${aws_eip.mgmt2.public_ip} --user ${var.admin_username} --password ${module.utils.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/aws_do_template.json")
  }
  depends_on = [aws_instance.vm1, null_resource.onboard0]
}

resource "null_resource" "onboard1" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_do1.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/aws_do_template.json")
  }
  depends_on = [local_file.do1, null_resource.login1]
}

output "public_vip_address" {
  value = "${aws_eip.vip1.public_ip}"
}

output "deployment_info" {
  value = {
    instances: [
      {
        admin_username = var.admin_username,
        admin_password = module.utils.admin_password,
        mgmt_address = aws_eip.mgmt1.public_ip,
        mgmt_port = 443,
        primary = true
      },
      {
        admin_username = var.admin_username,
        admin_password = module.utils.admin_password,
        mgmt_address = aws_eip.mgmt2.public_ip,
        mgmt_port = 443,
        primary = false
      }
    ],
    deploymentId: module.utils.env_prefix,
    environment: "aws"
  }
}