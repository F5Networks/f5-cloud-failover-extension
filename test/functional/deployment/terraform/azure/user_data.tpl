#!/bin/bash

mkdir -p /config/cloud
mkdir -p /var/log/cloud

cat << 'EOF' > /config/cloud/startup-script.sh
#!/bin/bash
#### ONBOARD #####
CLOUD_DIR="/config/cloud"
LOG_DIR="/var/log/cloud"
LOG_FILE=$${LOG_DIR}/startup-script.log

if [ ! -e $${LOG_FILE} ]; then
    touch $${LOG_FILE}
    exec &>>$${LOG_FILE}
fi

echo "Start time: $(date)"

adminUsername='${admin_username}'
adminPassword='${admin_password}'

# disable 1nic auto configuration
/usr/bin/setdb provision.1nicautoconfig disable

# wait for mcpd ready before attempting any tmsh command(s)
source /usr/lib/bigstart/bigip-ready-functions
wait_bigip_ready

# configure cm device-group and network-failover
if [ "${remote_host}/24" == "$(tmsh list sys management-ip one-line | cut -d' ' -f3)" ]; then
    tmsh modify sys global-settings hostname ${hostname}
    tmsh mv cm device bigip1 ${hostname}
    tmsh modify cm device ${hostname} configsync-ip ${remote_host}
    tmsh modify cm trust-domain add-device { ca-device true device-ip ${remote_host1} device-name ${hostname1} username $${adminUsername} password $${adminPassword} }
    tmsh create cm device-group failover-dg devices add { ${hostname} ${hostname1} } type sync-failover auto-sync enabled network-failover enabled
    tmsh modify cm device ${hostname} unicast-address { { effective-ip  ${remote_host} effective-port cap ip ${remote_host} } }
    tmsh create ltm virtual-address myVirtualAddress { address 10.0.0.10 traffic-group traffic-group-1 }
    tmsh run cm config-sync to-group failover-dg
else
    tmsh modify sys global-settings hostname ${hostname1}
    tmsh mv cm device bigip1 ${hostname1}
    tmsh modify cm device ${hostname1} configsync-ip ${remote_host1}
fi

# disable phone home - replace this with an update in the DO declaration when ID993 is completed
tmsh modify sys software update auto-phonehome disabled

# save config
tmsh save sys config

EOF

chmod 755 /config/cloud/startup-script.sh
nohup /config/cloud/startup-script.sh &
