#!/bin/bash

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

tmsh create auth user $${adminUsername} password $${adminPassword} shell bash partition-access replace-all-with { all-partitions { role admin } }
tmsh save /sys config

# TODO: Still need / want to echo when this is done?
# echo that we are done - should show up in the /var/log/cloud-init-output.log
echo "Admin user provisioned in userdata"