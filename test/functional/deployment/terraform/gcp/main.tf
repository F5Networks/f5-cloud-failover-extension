module "utils" {
  source = "../utils"
}
resource "random_integer" "ip_alias_4octet_vm01" {
  min               = 10
  max               = 250
}

resource "random_integer" "ip_alias_4octet_vm02" {
  min               = 10
  max               = 250
}

locals {
  hostname_suffix = "c.${var.project_id}.internal"
}

provider "google" {
  project = "${var.project_id}"
  region  = "${var.region}"
  zone    = "${var.zone}"
}

data "google_compute_image" "f5-bigip-image" {
  name = "f5-bigip-14-1-0-3-0-0-6-payg-good-5gbps-190326001429"
  project = "${var.imageProjectId}"
}

resource "google_compute_network" "ext_network" {
  name                    = "ext-net-${module.utils.env_prefix}"
  auto_create_subnetworks = false
  description             = "${var.reaper_tag}"
}

resource "google_compute_subnetwork" "ext_subnetwork" {
  name          = "ext-subnet-${module.utils.env_prefix}"
  region        = "${var.region}"
  ip_cidr_range = "${var.ext-subnet-cidr-range}"
  network       = "${google_compute_network.ext_network.self_link}"
  description   = "${var.reaper_tag}"
}

resource "google_compute_network" "mgmt_network" {
  name                    = "mgmt-net-${module.utils.env_prefix}"
  auto_create_subnetworks = false
  description             = "${var.reaper_tag}"
}

resource "google_compute_subnetwork" "mgmt_subnetwork" {
  name          = "mgmt-subnet-${module.utils.env_prefix}"
  region        = "${var.region}"
  ip_cidr_range = "${var.mgmt-subnet-cidr-range}"
  network       = "${google_compute_network.mgmt_network.self_link}"
  description   = "${var.reaper_tag}"
}

resource "google_compute_network" "int_network" {
  name                    = "int-net-${module.utils.env_prefix}"
  auto_create_subnetworks = false
  description             = "${var.reaper_tag}"
}

resource "google_compute_subnetwork" "int_subnetwork" {
  name          = "int-subnet-${module.utils.env_prefix}"
  region        = "${var.region}"
  ip_cidr_range = "${var.int-subnet-cidr-range}"
  network       = "${google_compute_network.int_network.self_link}"
  description   = "${var.reaper_tag}"
}

resource "google_compute_forwarding_rule" "forwarding-rule" {
  name = "tf-func-test-forwarding-rule-us-west1-${module.utils.env_prefix}"
  ip_protocol = "TCP"
  load_balancing_scheme = "EXTERNAL"
  target = "${google_compute_target_instance.vm02.self_link}"
  description = "${var.reaper_tag}"
}

resource "google_compute_target_instance" "vm01" {
  name        = "tf-func-test-target-vm01-${module.utils.env_prefix}"
  nat_policy  = "NO_NAT"
  instance    = "${google_compute_instance.vm01.self_link}"
  description = "${var.reaper_tag}"
}

resource "google_compute_target_instance" "vm02" {
  name        = "tf-func-test-target-vm02-${module.utils.env_prefix}"
  nat_policy  = "NO_NAT"
  instance    = "${google_compute_instance.vm02.self_link}"
  description = "${var.reaper_tag}"
}

resource "google_compute_firewall" "internal" {
  name    = "tf-func-test-bigip-traffic-internal-firewall-${module.utils.env_prefix}"
  network = "${google_compute_network.int_network.name}"
  description = "${var.reaper_tag}"

  allow {
    protocol = "icmp"
  }

  allow {
    protocol = "tcp"
    ports    = ["4353"]
  }

  allow {
    protocol = "udp"
    ports = ["1026"]
  }

}

resource "google_compute_firewall" "mgmt" {
  name    = "tf-func-test-bigip-traffic-mgmt-firewall-${module.utils.env_prefix}"
  network = "${google_compute_network.mgmt_network.name}"
  description = "${var.reaper_tag}"

  allow {
    protocol = "icmp"
  }

  allow {
    protocol = "tcp"
    ports    = ["4353"]
  }

  allow {
    protocol = "tcp"
    ports    = ["443", "22"]
  }

}

resource "google_compute_firewall" "ext" {
  name    = "tf-func-test-bigip-traffic-ext-firewall-${module.utils.env_prefix}"
  network = "${google_compute_network.ext_network.name}"
  description = "${var.reaper_tag}"

  allow {
    protocol = "tcp"
    ports    = ["443", "22"]
  }

  allow {
    protocol = "icmp"
  }

}

resource "google_storage_bucket" "file-store" {
  name = "${module.utils.env_prefix}"
  force_destroy = true
  labels = {
    f5_cloud_failover_label = "${module.utils.env_prefix}"
  }
}

data "template_file" "vm01_cloud_init_script" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username         = "${var.admin_username}"
    admin_password         = "${module.utils.admin_password}"
    ext_subnet_cidr_range  = "${var.ext-subnet-cidr-range}"
    int_subnet_cidr_range  = "${var.int-subnet-cidr-range}"
    mgmt_subnet_cidr_range = "${var.mgmt-subnet-cidr-range}"
    ext_subnet_gateway     = "${var.ext-subnet-getway}"
    int_subnet_gateway     = "${var.int-subnet-getway}"
    mgmt_subnet_gateway    = "${var.mgmt-subnet-getway}"
    ext_private_ip         = "${var.vm01-ext-private-ip}"
    int_private_ip         = "${var.vm01-int-private-ip}"
    mgmt_private_ip        = "${var.vm01-mgmt-private-ip}/24"
    hostname_suffix        = "${local.hostname_suffix}"
  }
}

data "template_file" "vm02_cloud_init_script" {
  template = "${file("${path.module}/user_data.tpl")}"

  vars = {
    admin_username         = "${var.admin_username}"
    admin_password         = "${module.utils.admin_password}"
    ext_subnet_cidr_range  = "${var.ext-subnet-cidr-range}"
    int_subnet_cidr_range  = "${var.int-subnet-cidr-range}"
    mgmt_subnet_cidr_range = "${var.mgmt-subnet-cidr-range}"
    mgmt_subnet_gateway    = "${var.mgmt-subnet-getway}"
    int_subnet_gateway     = "${var.int-subnet-getway}"
    ext_subnet_gateway     = "${var.ext-subnet-getway}"
    ext_private_ip         = "${var.vm02-ext-private-ip}"
    int_private_ip         = "${var.vm02-int-private-ip}"
    mgmt_private_ip        = "${var.vm02-mgmt-private-ip}/24"
    hostname_suffix        = "${local.hostname_suffix}"
  }
}

// Creating GCP resources for First BIGIP Instance
resource "google_compute_instance" "vm01" {
  name         = "tf-func-test-vm01-${module.utils.env_prefix}"
  machine_type = "${var.instance-type}"
  zone         = "${var.zone}"
  can_ip_forward = true
  description = "${var.reaper_tag}"

  labels = {
    f5_cloud_failover_label = "${module.utils.env_prefix}"
  }

  boot_disk {
    initialize_params {
      image = "${data.google_compute_image.f5-bigip-image.self_link}"
    }
  }

  network_interface {
    network = "${google_compute_network.ext_network.self_link}"
    subnetwork = "${google_compute_subnetwork.ext_subnetwork.self_link}"
    network_ip = "${var.vm01-ext-private-ip}"

    access_config {
    }
  }

  network_interface {
    network = "${google_compute_network.mgmt_network.self_link}"
    subnetwork = "${google_compute_subnetwork.mgmt_subnetwork.self_link}"
    network_ip = "${var.vm01-mgmt-private-ip}"

    access_config {
    }

  }

  network_interface {
    network = "${google_compute_network.int_network.self_link}"
    subnetwork = "${google_compute_subnetwork.int_subnetwork.self_link}"
    network_ip = "${var.vm01-int-private-ip}"
  }

  metadata = {
    foo = "bar"
  }

  metadata_startup_script = "${data.template_file.vm01_cloud_init_script.rendered}"

  service_account {
    scopes = ["cloud-platform"]
  }

}

// Creating GCP resources for Second BIGIP Instance

resource "google_compute_instance" "vm02" {
  name         = "tf-func-test-vm02-${module.utils.env_prefix}"
  machine_type = "${var.instance-type}"
  zone         = "${var.zone}"
  can_ip_forward = true
  description = "${var.reaper_tag}"

  labels = {
    f5_cloud_failover_label = "${module.utils.env_prefix}"
  }

  boot_disk {
    initialize_params {
      image = "${data.google_compute_image.f5-bigip-image.self_link}"
    }
  }

  network_interface {
    network = "${google_compute_network.ext_network.self_link}"
    subnetwork = "${google_compute_subnetwork.ext_subnetwork.self_link}"
    network_ip = "${var.vm02-ext-private-ip}"

    access_config {
    }
    alias_ip_range {
      ip_cidr_range = "${join( ".", concat(slice(split(".",google_compute_subnetwork.ext_subnetwork.ip_cidr_range), 0, 3), list(random_integer.ip_alias_4octet_vm02.result)))}/32"
    }
  }

  network_interface {
    network = "${google_compute_network.mgmt_network.self_link}"
    subnetwork = "${google_compute_subnetwork.mgmt_subnetwork.self_link}"
    network_ip = "${var.vm02-mgmt-private-ip}"

    access_config {
    }
  }

  network_interface {
    network = "${google_compute_network.int_network.self_link}"
    subnetwork = "${google_compute_subnetwork.int_subnetwork.self_link}"
    network_ip = "${var.vm02-int-private-ip}"
  }

  metadata = {
    foo = "bar"
  }
  metadata_startup_script = "${data.template_file.vm02_cloud_init_script.rendered}"

  service_account {
    scopes = ["cloud-platform"]
  }

}

// Route provisioning

resource "google_compute_route" "ext-route" {
  name        = "network-route-${module.utils.env_prefix}"
  description = "${var.reaper_tag} f5_cloud_failover_labels={\"f5_cloud_failover_label\":\"${module.utils.env_prefix}\",\"f5_self_ips\": [\"${google_compute_instance.vm01.network_interface.2.network_ip}\",\"${google_compute_instance.vm02.network_interface.2.network_ip}\"]}"
  dest_range  = "192.0.2.0/24"
  network     = "${google_compute_network.int_network.name}"
  next_hop_ip = "${google_compute_instance.vm02.network_interface.2.network_ip}"
  priority    = 100
}

// Onboarding

resource "local_file" "do01" {
  content  = templatefile("${path.module}/../../declarations/do/gcp_do_template.json", { hostname = "${google_compute_instance.vm01.name}.${local.hostname_suffix}", admin_username = "${var.admin_username}", admin_password = "${module.utils.admin_password}", internal_self_ip = "${google_compute_instance.vm01.network_interface.2.network_ip}", remote_mgmt_private_ip="${google_compute_instance.vm01.network_interface.1.network_ip}" , host01 = "${google_compute_instance.vm01.name}.${local.hostname_suffix}", host02 = "${google_compute_instance.vm02.name}.${local.hostname_suffix}"})
filename = "${path.module}/temp_do01.json"

  depends_on = [google_compute_instance.vm01]
}

resource "local_file" "do02" {
  content  = templatefile("${path.module}/../../declarations/do/gcp_do_template.json", { hostname = "${google_compute_instance.vm02.name}.${local.hostname_suffix}", admin_username = "${var.admin_username}", admin_password = "${module.utils.admin_password}", internal_self_ip = "${google_compute_instance.vm02.network_interface.2.network_ip}", remote_mgmt_private_ip="${google_compute_instance.vm01.network_interface.1.network_ip}", host01 = "${google_compute_instance.vm01.name}.${local.hostname_suffix}", host02 = "${google_compute_instance.vm02.name}.${local.hostname_suffix}"})
  filename = "${path.module}/temp_do02.json"

  depends_on = [google_compute_instance.vm02]
}

// Login into the first BIGIP host

resource "null_resource" "login01" {
  provisioner "local-exec" {
    command = "f5 bigip configure-auth --host ${google_compute_instance.vm01.network_interface.1.access_config.0.nat_ip} --user ${var.admin_username} --password ${module.utils.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/gcp_do_template.json")
  }
  depends_on = [google_compute_instance.vm01]
}

resource "null_resource" "delay_five_minutes" {
  provisioner "local-exec" {
    command = "sleep 300"
  }
  depends_on = [null_resource.login01]
}

resource "null_resource" "onboard01" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_do01.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/gcp_do_template.json")
  }
  depends_on = [local_file.do01, null_resource.delay_five_minutes]
}


resource "null_resource" "login02" {
  provisioner "local-exec" {
    command = "f5 bigip configure-auth --host ${google_compute_instance.vm02.network_interface.1.access_config.0.nat_ip} --user ${var.admin_username} --password ${module.utils.admin_password}"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/gcp_do_template.json")
  }
  depends_on = [google_compute_instance.vm02,null_resource.onboard01]
}

resource "null_resource" "delay_one_minute02" {
  provisioner "local-exec" {
    command = "sleep 60"
  }
  depends_on = [null_resource.login02]
}


resource "null_resource" "onboard02" {
  provisioner "local-exec" {
    command = "f5 bigip toolchain service create --install-component --component do --declaration ${path.module}/temp_do02.json"
  }
  triggers = {
    always_run = fileexists("${path.module}/../../declarations/do/gcp_do_template.json")
  }
  depends_on = [local_file.do02, null_resource.login02, null_resource.delay_one_minute02]
}

# Replace this with a POST to AS3 once the failover extension supports discovering virtual addresses in tenant partitions
resource "null_resource" "create_virtual01" {
  provisioner "local-exec" {
    command = "curl -skvvu ${var.admin_username}:${module.utils.admin_password} -X POST -H \"Content-Type: application/json\" https://${google_compute_instance.vm02.network_interface.1.access_config.0.nat_ip}/mgmt/tm/ltm/virtual-address -d '{\"name\":\"myVirtualAddress\",\"address\":\"${join( ".", concat(slice(split(".",google_compute_subnetwork.ext_subnetwork.ip_cidr_range), 0, 3), list(random_integer.ip_alias_4octet_vm02.result)))}\",\"trafficGroup\":\"traffic-group-1\"}'"
  }
  triggers = {
    always_run = timestamp()
  }
  depends_on = [null_resource.onboard02]
}


resource "null_resource" "create_virtual02" {
  provisioner "local-exec" {
    command = "curl -skvvu ${var.admin_username}:${module.utils.admin_password} -X POST -H \"Content-Type: application/json\" https://${google_compute_instance.vm02.network_interface.1.access_config.0.nat_ip}/mgmt/tm/ltm/virtual -d '{\"name\":\"external-pool\",\"destination\":\"${google_compute_forwarding_rule.forwarding-rule.ip_address}:80\"}'"
  }
  triggers = {
    always_run = timestamp()
  }
  depends_on = [null_resource.create_virtual01]
}

output "deployment_info" {
  value = {
    instances: [
      {
        admin_username = var.admin_username,
        admin_password = module.utils.admin_password,
        mgmt_address = google_compute_instance.vm01.network_interface.1.access_config.0.nat_ip,
        mgmt_port = 443,
        hostname = google_compute_instance.vm01.name
        primary = false
      },
      {
        admin_username = var.admin_username,
        admin_password = module.utils.admin_password,
        mgmt_address = google_compute_instance.vm02.network_interface.1.access_config.0.nat_ip,
        mgmt_port = 443,
        hostname = google_compute_instance.vm02.name
        primary = true
      }
    ],
    deploymentId: module.utils.env_prefix,
    environment: "gcp",
    region: "${var.region}",
    zone: "${var.zone}",
    networkTopology: "sameNetwork"
  }
}

