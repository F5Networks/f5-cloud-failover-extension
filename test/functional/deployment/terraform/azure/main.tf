resource "azurerm_resource_group" "deployment" {
  name     = var.env_prefix
  location = var.location
}

resource "azurerm_virtual_network" "deployment" {
  name                = "${var.env_prefix}-network"
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
  name                = "${var.env_prefix}-mgmt-pip0"
  location            = azurerm_resource_group.deployment.location
  resource_group_name = azurerm_resource_group.deployment.name
  allocation_method   = "Static"
}

resource "azurerm_public_ip" "pip1" {
  name                = "${var.env_prefix}-mgmt-pip1"
  location            = azurerm_resource_group.deployment.location
  resource_group_name = azurerm_resource_group.deployment.name
  allocation_method   = "Static"
}

resource "azurerm_network_security_group" "deployment" {
  name                = "${var.env_prefix}-sg"
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
  name                      = "${var.env_prefix}-mgmt0"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${var.env_prefix}-mgmt0"
    subnet_id                     = azurerm_subnet.mgmt.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.0.4"
    public_ip_address_id          = azurerm_public_ip.pip0.id
  }
}

resource "azurerm_network_interface" "mgmt1" {
  name                      = "${var.env_prefix}-mgmt1"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${var.env_prefix}-mgmt1"
    subnet_id                     = azurerm_subnet.mgmt.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.0.5"
    public_ip_address_id          = azurerm_public_ip.pip1.id
  }
}

resource "azurerm_network_interface" "internal0" {
  name                      = "${var.env_prefix}-int0"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${var.env_prefix}-int0"
    subnet_id                     = azurerm_subnet.internal.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.4"
  }
}

resource "azurerm_network_interface" "internal1" {
  name                      = "${var.env_prefix}-int1"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${var.env_prefix}-int1"
    subnet_id                     = azurerm_subnet.internal.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.5"
  }
}

resource "azurerm_network_interface" "external0" {
  name                      = "${var.env_prefix}-ext0"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${var.env_prefix}-ext0"
    subnet_id                     = azurerm_subnet.external.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.2.4"
  }
}

resource "azurerm_network_interface" "external1" {
  name                      = "${var.env_prefix}-ext1"
  location                  = azurerm_resource_group.deployment.location
  resource_group_name       = azurerm_resource_group.deployment.name
  network_security_group_id = azurerm_network_security_group.deployment.id

  ip_configuration {
    name                          = "${var.env_prefix}-ext1"
    subnet_id                     = azurerm_subnet.external.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.2.5"
  }
}

resource "azurerm_virtual_machine" "vm0" {
  name                         = "${var.env_prefix}-vm0"
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
    admin_password = var.admin_password
  }

  os_profile_linux_config {
    disable_password_authentication = false
  }
}

resource "azurerm_virtual_machine" "vm1" {
  name                         = "${var.env_prefix}-vm1"
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
    admin_password = var.admin_password
  }

  os_profile_linux_config {
    disable_password_authentication = false
  }
}

resource "local_file" "do0" {
    content  = templatefile("${path.module}/../../declarations/do_cluster.json", { internal_self = "10.0.1.4", external_self = "10.0.2.4" })
    filename = "${path.module}/do0.json"
}

resource "local_file" "do1" {
    content  = templatefile("${path.module}/../../declarations/do_cluster.json", { internal_self = "10.0.1.5", external_self = "10.0.2.5" })
    filename = "${path.module}/do1.json"
}

resource "null_resource" "login0" {
  provisioner "local-exec" {
    command = "f5 bigip login --host ${azurerm_public_ip.pip0.ip_address} --user ${var.admin_username} --password ${var.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [azurerm_virtual_machine.vm0]
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
    command = "f5 bigip login --host ${azurerm_public_ip.pip1.ip_address} --user ${var.admin_username} --password ${var.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do_cluster.json")
  }
  depends_on = [
    azurerm_virtual_machine.vm1,
    null_resource.onboard0,
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

output "public_ip_address0" {
  value = azurerm_public_ip.pip0.ip_address
}

output "public_ip_address1" {
  value = azurerm_public_ip.pip1.ip_address
}

