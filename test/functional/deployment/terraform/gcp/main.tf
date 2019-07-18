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

# Put GCP-specific resources here

resource "local_file" "do0" {
    content  = templatefile("${path.module}/../../declarations/do_cluster.json", { hostname = "failover0.local", admin_password = "${random_string.admin_password.result}", internal_self = "10.0.1.4/24", external_self = "10.0.2.4/24" })
    filename = "${path.module}/do0.json"
}

resource "local_file" "do1" {
    content  = templatefile("${path.module}/../../declarations/do_cluster.json", { hostname = "failover1.local", admin_password = "${random_string.admin_password.result}", internal_self = "10.0.1.5/24", external_self = "10.0.2.5/24" })
    filename = "${path.module}/do1.json"
}

resource "null_resource" "login0" {
  provisioner "local-exec" {
    command = "f5 bigip login --host ${azurerm_public_ip.pip0.ip_address} --user ${var.admin_username} --password ${random_string.admin_password.result}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [google_compute_instance.vm0]
}

# Replace this with a POST to AS3 once the failover extension supports discovering virtual addresses in tenant partitions
resource "null_resource" "create_virtual0" {
  provisioner "local-exec" {
    command = "curl -skvvu ${var.admin_username}:${random_string.admin_password.result} -X POST -H \"Content-Type: application/json\" https://${azurerm_public_ip.pip0.ip_address}/mgmt/tm/ltm/virtual-address -d '{\"name\":\"myVirtualAddress\",\"address\":\"10.0.2.10\",\"trafficGroup\":\"traffic-group-1\"}'"
  }
  triggers = {
    always_run = timestamp()
  }
  depends_on = [null_resource.login0]
}

resource "null_resource" "failover0" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component failover --declaration ${path.module}/../../declarations/failover_azure.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/failover_azure.json")
  }
  depends_on = [null_resource.login0]
}

resource "null_resource" "onboard0" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/do0.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [local_file.do0, null_resource.failover0]
}

resource "null_resource" "login1" {
  provisioner "local-exec" {
    command = "f5 bigip login --host ${azurerm_public_ip.pip1.ip_address} --user ${var.admin_username} --password ${random_string.admin_password.result}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [
    google_compute_instance.vm1,
    null_resource.onboard0
  ]
}

resource "null_resource" "failover1" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component failover --declaration ${path.module}/../../declarations/failover_azure.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/failover_azure.json")
  }
  depends_on = [null_resource.login1]
}

resource "null_resource" "onboard1" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/do1.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [local_file.do1, null_resource.failover1]
}

output "deployment_name" {
  value = random_string.env_prefix.result
}

output "admin_password" {
  value = random_string.admin_password.result
}

