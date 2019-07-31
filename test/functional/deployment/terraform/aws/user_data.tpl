#!/bin/bash

# Disable 1nic auto configuration
/usr/bin/setdb provision.1nicautoconfig disable

# What is in ifconfig?
echo $(ifconfig)

adminUsername='${admin_username}'
adminPassword='${admin_password}'

# Wait for mcpd ready before attempting to create admin user
checks=0
while [ $checks -lt 120 ]; do echo checking mcpd
    tmsh -a show sys mcp-state field-fmt | grep -q running
    if [ $? == 0 ]; then
        echo mcpd ready
        break
    fi
    echo mcpd not ready yet
    let checks=checks+1
    sleep 10
done

echo tmsh create sys folder /LOCAL_ONLY device-group none traffic-group traffic-group-local-only
tmsh create sys folder /LOCAL_ONLY device-group none traffic-group traffic-group-local-only

echo tmsh create net route /LOCAL_ONLY/default network default gw $${gateway}
tmsh create net route /LOCAL_ONLY/default network default gw $${gateway}

echo create auth user $${adminUsername} password ..... shell bash partition-access replace-all-with { all-partitions { role admin } }
tmsh create auth user $${adminUsername} password $${adminPassword} shell bash partition-access replace-all-with { all-partitions { role admin } }

echo tmsh save sys config
tmsh save sys config