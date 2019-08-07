module "utils" {
  source = "../utils"
}

resource "azurerm_resource_group" "deployment" {
  name      = "${module.utils.env_prefix}"
  location  = "${var.location}"
  tags  = {
    creator = "Terraform"
    delete  = "True"
  }
}

resource "azurerm_role_assignment" "vm0_assignment" {
  scope                 = azurerm_resource_group.deployment.id
  role_definition_name  = "Contributor"
  principal_id          = lookup(azurerm_virtual_machine.vm0.identity[0], "principal_id")
}

resource "azurerm_role_assignment" "vm1_assignment" {
  scope                 = azurerm_resource_group.deployment.id
  role_definition_name  = "Contributor"
  principal_id          = lookup(azurerm_virtual_machine.vm1.identity[0], "principal_id")
}

resource "azurerm_virtual_network" "deployment" {
  name                = "${module.utils.env_prefix}-network"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.deployment.location
  resource_group_name = azurerm_resource_group.deployment.name
}

resource "azurerm_subnet" "mgmt" {
  name                 = "mgmt"
  resource_group_name  = azurerm_resource_group.deployment.name
  virtual_network_name = azurerm_virtual_network.deployment.name
  address_prefix       = "10.0.0.0/24"
}

resource "azurerm_subnet" "internal" {
  name                 = "internal"
  resource_group_name  = azurerm_resource_group.deployment.name
  virtual_network_name = azurerm_virtual_network.deployment.name
  address_prefix       = "10.0.1.0/24"
}

resource "azurerm_subnet" "external" {
  name                 = "external"
  resource_group_name  = azurerm_resource_group.deployment.name
  virtual_network_name = azurerm_virtual_network.deployment.name
  address_prefix       = "10.0.2.0/24"
}

resource "azurerm_public_ip" "pip0" {
  name                = "${module.utils.env_prefix}-mgmt-pip0"
  location            = azurerm_resource_group.deployment.location
  resource_group_name = azurerm_resource_group.deployment.name
  allocation_method   = "Static"
}

resource "azurerm_public_ip" "pip1" {
  name                = "${module.utils.env_prefix}-mgmt-pip1"
  location            = azurerm_resource_group.deployment.location
  resource_group_name = azurerm_resource_group.deployment.name
  allocation_method   = "Static"
}

resource "azurerm_network_security_group" "deployment" {
  name                = "${module.utils.env_prefix}-sg"
  location            = azurerm_resource_group.deployment.location
  resource_group_name = azurerm_resource_group.deployment.name
  security_rule {
    name                       = "allow_all"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_interface" "mgmt0" {
  name                      = "${module.utils.env_prefix}-mgmt0"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${module.utils.env_prefix}-mgmt0"
    subnet_id                     = azurerm_subnet.mgmt.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.0.4"
    public_ip_address_id          = azurerm_public_ip.pip0.id
  }
}

resource "azurerm_network_interface" "mgmt1" {
  name                      = "${module.utils.env_prefix}-mgmt1"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${module.utils.env_prefix}-mgmt1"
    subnet_id                     = azurerm_subnet.mgmt.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.0.5"
    public_ip_address_id          = azurerm_public_ip.pip1.id
  }
}

resource "azurerm_network_interface" "internal0" {
  name                      = "${module.utils.env_prefix}-int0"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${module.utils.env_prefix}-int0"
    subnet_id                     = azurerm_subnet.internal.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.4"
  }

  tags = {
    F5_CLOUD_FAILOVER_LABEL = "mydeployment"
  }
}

resource "azurerm_network_interface" "internal1" {
  name                      = "${module.utils.env_prefix}-int1"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${module.utils.env_prefix}-int1"
    subnet_id                     = azurerm_subnet.internal.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.5"
  }

  tags = {
    F5_CLOUD_FAILOVER_LABEL = "mydeployment"
  }
}

resource "azurerm_network_interface" "external0" {
  name                      = "${module.utils.env_prefix}-ext0"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${module.utils.env_prefix}-ext0"
    subnet_id                     = azurerm_subnet.external.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.2.4"
  }

  tags = {
    F5_CLOUD_FAILOVER_LABEL = "mydeployment"
  }
}

resource "azurerm_network_interface" "external1" {
  name                      = "${module.utils.env_prefix}-ext1"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${module.utils.env_prefix}-ext1"
    subnet_id                     = azurerm_subnet.external.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.2.5"
    primary                       = true
  }

  ip_configuration {
    name                          = "${module.utils.env_prefix}-ext2"
    subnet_id                     = azurerm_subnet.external.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.2.10"
  }

  tags = {
    F5_CLOUD_FAILOVER_LABEL = "mydeployment"
  }
}

resource "azurerm_virtual_machine" "vm0" {
  name                         = "${module.utils.env_prefix}-vm0"
  location                     = azurerm_resource_group.deployment.location
  resource_group_name          = azurerm_resource_group.deployment.name
  network_interface_ids        = [azurerm_network_interface.mgmt0.id, azurerm_network_interface.internal0.id, azurerm_network_interface.external0.id]
  primary_network_interface_id = azurerm_network_interface.mgmt0.id
  vm_size                      = var.instance_size

  # This means the OS Disk will be deleted when Terraform destroys the Virtual Machine
  # NOTE: This may not be optimal in all cases.
  delete_os_disk_on_termination = true

  # This means the Data Disk Disk will be deleted when Terraform destroys the Virtual Machine
  # NOTE: This may not be optimal in all cases.
  delete_data_disks_on_termination = true

  storage_image_reference {
    publisher = var.publisher
    offer     = var.offer
    sku       = var.sku
    version   = var.bigip_version
  }

  plan {
    publisher = var.publisher
    product   = var.offer
    name      = var.sku
  }

  storage_os_disk {
    name              = "osdisk0"
    caching           = "ReadWrite"
    create_option     = "FromImage"
    managed_disk_type = "Standard_LRS"
  }

  os_profile {
    computer_name  = "f5vm0"
    admin_username = var.admin_username
    admin_password = "${module.utils.admin_password}"
  }

  os_profile_linux_config {
    disable_password_authentication = false
  }

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_virtual_machine" "vm1" {
  name                         = "${module.utils.env_prefix}-vm1"
  location                     = azurerm_resource_group.deployment.location
  resource_group_name          = azurerm_resource_group.deployment.name
  network_interface_ids        = [azurerm_network_interface.mgmt1.id, azurerm_network_interface.internal1.id, azurerm_network_interface.external1.id]
  primary_network_interface_id = azurerm_network_interface.mgmt1.id
  vm_size                      = var.instance_size

  # This means the OS Disk will be deleted when Terraform destroys the Virtual Machine
  # NOTE: This may not be optimal in all cases.
  delete_os_disk_on_termination = true

  # This means the Data Disk Disk will be deleted when Terraform destroys the Virtual Machine
  # NOTE: This may not be optimal in all cases.
  delete_data_disks_on_termination = true

  storage_image_reference {
    publisher = var.publisher
    offer     = var.offer
    sku       = var.sku
    version   = var.bigip_version
  }

  plan {
    publisher = var.publisher
    product   = var.offer
    name      = var.sku
  }

  storage_os_disk {
    name              = "osdisk1"
    caching           = "ReadWrite"
    create_option     = "FromImage"
    managed_disk_type = "Standard_LRS"
  }

  os_profile {
    computer_name  = "f5vm1"
    admin_username = var.admin_username
    admin_password = "${module.utils.admin_password}"
  }

  os_profile_linux_config {
    disable_password_authentication = false
  }

  identity {
    type = "SystemAssigned"
  }
}

resource "local_file" "do0" {
    content  = templatefile("${path.module}/../../declarations/do_cluster.json", { hostname = "failover0.local", admin_password = "${module.utils.admin_password}", internal_self = "10.0.1.4/24", external_self = "10.0.2.4/24" })
    filename = "${path.module}/temp_do0.json"
}

resource "local_file" "do1" {
    content  = templatefile("${path.module}/../../declarations/do_cluster.json", { hostname = "failover1.local", admin_password = "${module.utils.admin_password}", internal_self = "10.0.1.5/24", external_self = "10.0.2.5/24" })
    filename = "${path.module}/temp_do1.json"
}

resource "null_resource" "login0" {
  provisioner "local-exec" {
    command = "f5 bigip login --host ${azurerm_public_ip.pip0.ip_address} --user ${var.admin_username} --password ${module.utils.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [azurerm_virtual_machine.vm0]
}

# Replace this with a POST to AS3 once the failover extension supports discovering virtual addresses in tenant partitions
resource "null_resource" "create_virtual0" {
  provisioner "local-exec" {
    command = "curl -skvvu ${var.admin_username}:${module.utils.admin_password} -X POST -H \"Content-Type: application/json\" https://${azurerm_public_ip.pip0.ip_address}/mgmt/tm/ltm/virtual-address -d '{\"name\":\"myVirtualAddress\",\"address\":\"10.0.2.10\",\"trafficGroup\":\"traffic-group-1\"}'"
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
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_do0.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [local_file.do0, null_resource.failover0]
}

resource "null_resource" "login1" {
  provisioner "local-exec" {
    command = "f5 bigip login --host ${azurerm_public_ip.pip1.ip_address} --user ${var.admin_username} --password ${module.utils.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [
    azurerm_virtual_machine.vm1,
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
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_do1.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [local_file.do1, null_resource.failover1]
}

output "resource_group_name" {
  value = module.utils.env_prefix
}

output "public_ip_address_0" {
  value = azurerm_public_ip.pip0.ip_address
}

output "public_ip_address_1" {
  value = azurerm_public_ip.pip1.ip_address
}

output "admin_username" {
  value = var.admin_username
}

output "admin_password" {
  value = module.utils.admin_password
}

