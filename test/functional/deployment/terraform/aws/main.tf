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

locals {
  availability_zones = {
    primary   = "a"
    secondary = (var.use_availability_zones ? "b" : "a")
  }
}

module "network" {
  source = "./components/network"

  region                 = var.aws_region
  global_tags            = var.global_tags
  env_prefix             = module.utils.env_prefix
  use_availability_zones = var.use_availability_zones
  availability_zones     = local.availability_zones
}

resource "aws_security_group" "external" {
  description = "External interface rules"
  vpc_id = "${module.network.network_id}"

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
  vpc_id = "${module.network.network_id}"

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
      Name = "failoverextension-${module.utils.env_prefix}-s3bucket",
      f5_cloud_failover_label = "${module.utils.env_prefix}"
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

// Addresses write action do not have Resource type associate with it
// "ec2:Vpc": "arn:aws:ec2:${var.aws_region}::vpc/${module.network.network_id}"
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
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeNetworkInterfaceAttribute",
        "ec2:DescribeRouteTables",
        "s3:ListAllMyBuckets",
        "ec2:AssociateAddress",
        "ec2:DisassociateAddress",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses"
      ],
      "Resource": "*",
      "Effect": "Allow"
    },
    {
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam:::role/Failover-Extension-IAM-role-${module.utils.env_prefix}",
      "Effect": "Allow"
    },
    {
      "Action": [
        "ec2:DescribeRouteTables",
        "ec2:CreateRoute",
        "ec2:ReplaceRoute"
      ],
      "Resource": "arn:aws:ec2:${var.aws_region}::route-table/*",
      "Condition": {
        "StringEquals": {
          "ec2:Region": "${var.aws_region}""
        }
      },
      "Effect": "Allow"
    },
    {
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketTagging"
      ],
      "Resource": "arn:aws:s3:::${aws_s3_bucket.configdb.id}",
      "Effect": "Allow"
    },
    {
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${aws_s3_bucket.configdb.id}/*",
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
  subnet_id = "${module.network.mgmt_subnet_1_id}"
  security_groups = ["${aws_security_group.mgmt.id}"]
  description = "Management Interface for BIG-IP"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Mgmt Network Interface 1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "mgmt1" {
  vpc = true
  network_interface = "${aws_network_interface.mgmt1.id}"
  associate_with_private_ip = "${aws_network_interface.mgmt1.private_ip}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP Mgmt 1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"

  depends_on = ["aws_instance.vm0"]
}

resource "aws_network_interface" "mgmt2" {
  subnet_id = "${module.network.mgmt_subnet_2_id}"
  security_groups = ["${aws_security_group.mgmt.id}"]
  description = "Management Interface for BIG-IP"

  tags = "${merge(
    var.global_tags,
    {
      Name = "Mgmt Network Interface 2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "mgmt2" {
  vpc = true
  network_interface = "${aws_network_interface.mgmt2.id}"
  associate_with_private_ip = "${aws_network_interface.mgmt2.private_ip}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP Mgmt 2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"

  depends_on = ["aws_instance.vm1"]
}

resource "aws_network_interface" "external1" {
  subnet_id = "${module.network.ext_subnet_1_id}"
  security_groups = ["${aws_security_group.external.id}"]
  description = "Public External Interface for the BIG-IP"

  // only a single private IP is required for an application in the "same network"
  // topology, create the IP on the second BIG-IP
  private_ips_count = "${var.use_availability_zones ? 1 : 0}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "External Network Interface 1: Failover Extension-${module.utils.env_prefix}",
      f5_cloud_failover_label = "${module.utils.env_prefix}",
      f5_cloud_failover_nic_map = "external"
    }
  )}"
}

resource "aws_eip" "external1" {
  vpc = true
  network_interface = "${aws_network_interface.external1.id}"
  associate_with_private_ip = "${aws_network_interface.external1.private_ip}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP External 1: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_network_interface" "external2" {
  subnet_id = "${module.network.ext_subnet_2_id}"
  security_groups = ["${aws_security_group.external.id}"]
  description = "Public External Interface for the BIG-IP"

  private_ips_count = 1

  tags = "${merge(
    var.global_tags,
    {
      Name = "External Network Interface 2: Failover Extension-${module.utils.env_prefix}",
      f5_cloud_failover_label = "${module.utils.env_prefix}",
      f5_cloud_failover_nic_map = "external"
    }
  )}"
}

resource "aws_eip" "external2" {
  vpc = true
  network_interface = "${aws_network_interface.external2.id}"
  associate_with_private_ip = "${aws_network_interface.external2.private_ip}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP External 2: Failover Extension-${module.utils.env_prefix}"
    }
  )}"
}

resource "aws_eip" "vip1" {
  vpc = true
  network_interface = "${aws_network_interface.external2.id}"
  associate_with_private_ip = "${tolist(aws_network_interface.external2.private_ips)[1] != aws_network_interface.external2.private_ip ? tolist(aws_network_interface.external2.private_ips)[1] : tolist(aws_network_interface.external2.private_ips)[0]}"

  tags = "${merge(
    var.global_tags,
    {
      Name = "ElasticIP VIP: Failover Extension-${module.utils.env_prefix}",
      f5_cloud_failover_label = "${module.utils.env_prefix}",
      // VIPS value is conditional on network topology
      // - across network: should contain '<BIG-IP 1 private application IP>,<BIG-IP 2 private application IP>'
      // - same network: should either not exist or contain an empty string
      VIPS = "${var.use_availability_zones ? "${tolist(aws_network_interface.external1.private_ips)[1] != aws_network_interface.external1.private_ip ? tolist(aws_network_interface.external1.private_ips)[1] : tolist(aws_network_interface.external1.private_ips)[0]},${tolist(aws_network_interface.external2.private_ips)[1] != aws_network_interface.external2.private_ip ? tolist(aws_network_interface.external2.private_ips)[1] : tolist(aws_network_interface.external2.private_ips)[0]}" : ""}"
    }
  )}"
}

resource "aws_route_table" "external" {
  vpc_id = "${module.network.network_id}"

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = "${module.network.internet_gateway_id}"
  }
  route {
    cidr_block = "192.0.2.0/24"
    network_interface_id = "${aws_network_interface.external2.id}"
  }

  tags = "${merge(
    var.global_tags,
    {
      Name = "External Route Table: Failover Extension-${module.utils.env_prefix}"
      f5_cloud_failover_label = "${module.utils.env_prefix}"
      f5_self_ips = "${aws_network_interface.external1.private_ip},${aws_network_interface.external2.private_ip}"
    }
  )}"
}

resource "aws_route_table_association" "external1" {
  subnet_id      = "${module.network.ext_subnet_1_id}"
  route_table_id = "${aws_route_table.external.id}"
}

resource "aws_route_table_association" "external2" {
  count = "${var.use_availability_zones ? 1 : 0}"

  subnet_id      = "${module.network.ext_subnet_2_id}"
  route_table_id = "${aws_route_table.external.id}"
}

data "template_file" "user_data_vm0" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username  = "${var.admin_username}"
    admin_password  = "${module.utils.admin_password}"
    external_self   = "${aws_network_interface.external1.private_ip}/24"
    subnet          = "${module.network.ext_subnet_2_cidr_block}"
    default_gw      = "10.0.1.1"
  }
}

data "template_file" "user_data_vm1" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username = "${var.admin_username}"
    admin_password = "${module.utils.admin_password}"
    external_self  = "${aws_network_interface.external2.private_ip}/24"
    subnet          = "${module.network.ext_subnet_1_cidr_block}"
    default_gw      = "10.0.11.1"
  }
}

resource "null_resource" "delay" {
  provisioner "local-exec" {
    command = "sleep 30"
  }
}

resource "aws_instance" "vm0" {
  ami = "${var.aws_bigip_ami_id}"
  instance_type = "m5.xlarge"
  availability_zone = "${var.aws_region}${local.availability_zones["primary"]}"
  key_name = var.instance_key_name

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
      deploymentId = "${module.utils.env_prefix}"
    }
  )}"

  # Wait until the instance is in a running state
  provisioner "local-exec" {
    command = "aws ec2 wait instance-status-ok --instance-ids ${aws_instance.vm0.id} --region ${var.aws_region}"
  }

  depends_on = [null_resource.delay]
}

resource "aws_instance" "vm1" {
  ami = "${var.aws_bigip_ami_id}"
  instance_type = "m5.xlarge"
  availability_zone = "${var.aws_region}${local.availability_zones["secondary"]}"
  key_name = var.instance_key_name

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
      deploymentId = "${module.utils.env_prefix}"
    }
  )}"

  # Wait until the instance is in a running state
  provisioner "local-exec" {
    command = "aws ec2 wait instance-status-ok --instance-ids ${aws_instance.vm1.id} --region ${var.aws_region}"
  }

  depends_on = [null_resource.delay]
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

# create floating traffic group virtual address only for the same network topology
resource "null_resource" "create_virtual" {
  count = "${var.use_availability_zones ? 0 : 1}"

  provisioner "local-exec" {
    command = "curl -skvvu ${var.admin_username}:${module.utils.admin_password} -X POST -H \"Content-Type: application/json\" https://${aws_eip.mgmt2.public_ip}/mgmt/tm/ltm/virtual-address -d '{\"name\":\"myVirtualAddress\",\"address\":\"${aws_eip.vip1.private_ip}\",\"trafficGroup\":\"traffic-group-1\"}'"
  }
  triggers = {
    always_run = "${timestamp()}"
  }
  depends_on = [null_resource.onboard1]
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
        instanceId = aws_instance.vm0.id,
        mgmt_port = 443,
        hostname = "failover0.local",
        primary = false
      },
      {
        admin_username = var.admin_username,
        admin_password = module.utils.admin_password,
        mgmt_address = aws_eip.mgmt2.public_ip,
        instanceId = aws_instance.vm1.id,
        mgmt_port = 443,
        hostname = "failover1.local",
        primary = true
      }
    ],
    deploymentId: module.utils.env_prefix,
    environment: "aws",
    region: var.aws_region,
    networkTopology: "${var.use_availability_zones ? "acrossNetwork" : "sameNetwork"}"
  }
}
