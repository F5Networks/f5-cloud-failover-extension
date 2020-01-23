#!/bin/bash

adminUsername='${admin_username}'
adminPassword='${admin_password}'

# disable 1nic auto configuration
/usr/bin/setdb provision.1nicautoconfig disable

# wait for mcpd ready before attempting any tmsh command(s)
source /usr/lib/bigstart/bigip-ready-functions
wait_bigip_ready

# create LOCAL_ONLY partition
tmsh create sys folder /LOCAL_ONLY device-group none traffic-group traffic-group-local-only

# create external VLAN, self IP, default route here - workaround for DO until JIRA ID AUTOTOOL-616 is complete
tmsh create net vlan external interfaces replace-all-with { 1.1 }
tmsh create net self externalSelf address ${external_self} vlan external allow-service default traffic-group traffic-group-local-only
tmsh create net route /LOCAL_ONLY/internal network ${subnet} gw ${default_gw}

# create user
tmsh create auth user $${adminUsername} password $${adminPassword} shell bash partition-access replace-all-with { all-partitions { role admin } }

# disable phone home - replace this with an update in the DO declaration when ID993 is completed
tmsh modify sys software update auto-phonehome disabled

# disable legacy aws failover script
mount -o remount,rw /usr
mv /usr/libexec/aws/aws-failover-tgactive.sh /usr/libexec/aws/aws-failover-tgactive.sh.disabled
mount -o remount,ro /usr

# save config
tmsh save sys config
