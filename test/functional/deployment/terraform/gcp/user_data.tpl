#!/bin/bash

# Embed Post-NIC-Swap
cat << 'EOF' > /config/post-nic-swap.sh
      #!/bin/bash
      # STAGE 2
      source /usr/lib/bigstart/bigip-ready-functions
      wait_bigip_ready

      tmsh delete sys management-route default
      tmsh delete sys management-ip all
      tmsh create sys management-ip $(cat /config/mgmt_private_ip.txt)
      tmsh create sys management-route default network default gateway $(cat /config/mgmt_subnet_gateway.txt)
      tmsh modify sys global-settings remote-host add { metadata.google.internal { hostname metadata.google.internal addr 169.254.169.254 } }
      tmsh save /sys config

      tmsh create net vlan external interfaces add { 1.0 } mtu 1460
      tmsh create net self $(cat /config/ext_private_ip.txt)/32 vlan external
      tmsh create net route ext_gw_int network $(cat /config/ext_subnet_gateway.txt)/32 interface external
      tmsh create net route ext_rt network $(cat /config/ext_subnet_cidr_range.txt) gw $(cat /config/ext_subnet_gateway.txt)
      tmsh create net route default gw $(cat /config/ext_subnet_gateway.txt)
      tmsh create net vlan internal interfaces add { 1.2 } mtu 1460
      tmsh create net self $(cat /config/int_private_ip.txt)/32 vlan internal allow-service add { tcp:4353 udp:1026 }
      tmsh create net route int_gw_int network $(cat /config/int_subnet_gateway.txt)/32 interface internal
      tmsh create net route int_rt network $(cat /config/int_subnet_cidr_range.txt) gw $(cat /config/int_subnet_gateway.txt)
      tmsh modify cm device $(cat /config/hostname.txt) unicast-address { { effective-ip $(cat /config/int_private_ip.txt) effective-port 1026 ip $(cat /config/int_private_ip.txt) } }
      tmsh modify sys db failover.selinuxallowscripts value enable

      tmsh save /sys config

      #bigstart restart restjavad
      #bigstart restart restnoded

EOF

cat << 'EOF' > /config/first-run.sh
    #!/bin/bash
    source /usr/lib/bigstart/bigip-ready-functions
    # Wait for mcpd to get ready
    wait_bigip_ready

    if [ ! -f /config/first_run_flag ]; then

        touch /config/first_run_flag

        adminUsername='${admin_username}'
        adminPassword='${admin_password}'
        sleep 15
        tmsh create auth user $${adminUsername} password $${adminPassword} shell bash partition-access replace-all-with { all-partitions { role admin } }
        tmsh save /sys config

        echo ${hostname} > /config/hostname.txt
        echo ${ext_private_ip} > /config/ext_private_ip.txt
        echo ${int_private_ip} > /config/int_private_ip.txt
        echo ${mgmt_private_ip} > /config/mgmt_private_ip.txt

        echo ${int_subnet_gateway} > /config/int_subnet_gateway.txt
        echo ${ext_subnet_gateway} > /config/ext_subnet_gateway.txt
        echo ${mgmt_subnet_gateway} > /config/mgmt_subnet_gateway.txt

        echo ${int_subnet_cidr_range} > /config/int_subnet_cidr_range.txt
        echo ${ext_subnet_cidr_range} > /config/ext_subnet_cidr_range.txt
        echo ${mgmt_subnet_cidr_range} > /config/mgmt_subnet_cidr_range.txt

        chmod +w /config/startup
        chmod +x /config/post-nic-swap.sh
        echo "/config/post-nic-swap.sh" >> /config/startup

        /usr/bin/setdb provision.managementeth eth1
        tmsh save /sys config
        reboot
    fi
EOF

chmod 755 /config/first-run.sh
nohup /config/first-run.sh &
